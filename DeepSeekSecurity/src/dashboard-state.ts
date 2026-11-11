import { dashboardSchema, stateSchema, repairResultSchema, canRepair, type RepairResult, type Dashboard, type FindingStatus, type SecurityRemote, type StartRequest, type Task } from './contracts.ts'

export type DashboardSnapshot = { data: Dashboard | null; error: string | null; loading: boolean; busy: boolean }

/** 观察不启动任务；版本号隔离迟到响应。 Observation never launches work; versions reject stale responses. */
export class DashboardObserver {
  private snapshot: DashboardSnapshot = { data: null, error: null, loading: true, busy: false }
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private live = false
  private version = 0
  private actionError: string | null = null
  private repairConversations = new Map<string, RepairResult>()
  constructor(private remote: SecurityRemote, private sessionId: string, private timeoutMs = 15000) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(change: Partial<DashboardSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change }
    for (const listener of this.listeners) listener()
  }
  start() { this.live = true; void this.refresh() }
  dispose() { this.live = false; this.version++; clearTimeout(this.timer) }
  async refresh(clearActionError = false) {
    if (!this.live || this.snapshot.busy) return
    if (clearActionError) { this.actionError = null; this.publish({ error: null }) }
    clearTimeout(this.timer)
    const version = ++this.version
    if (!this.snapshot.data) this.publish({ loading: true, error: null })
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        this.remote.dashboard({ sessionId: this.sessionId }),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('安全工作台读取超时，请检查 DSH 宿主连接后重试。')), this.timeoutMs) }),
      ])
      if (!this.live || version !== this.version) return
      if (!result.ok) throw new Error(result.error.message)
      this.publish({ data: dashboardSchema.parse(result.value), loading: false, error: this.actionError })
    } catch (error) {
      if (this.live && version === this.version) this.publish({ error: message(error), loading: false })
    } finally {
      clearTimeout(deadline)
      if (this.live && version === this.version && this.snapshot.data) this.timer = setTimeout(() => { void this.refresh() }, 2500)
    }
  }
  async act(kind: 'start' | 'cancel', options: Omit<StartRequest, 'sessionId'> = {}, onStarted?: (task: Task) => Promise<void>) {
    if (!this.live || this.snapshot.busy) return false
    clearTimeout(this.timer)
    const version = ++this.version
    this.actionError = null
    this.publish({ busy: true, error: null })
    let success = false
    try {
      const request = { ...options, sessionId: this.sessionId }
      const result = kind === 'start' ? await this.remote.start(request) : await this.remote.cancel({ sessionId: this.sessionId, taskId: this.snapshot.data?.tasks[0]?.id })
      if (!this.live || version !== this.version) return false
      if (!result.ok) throw new Error(result.error.message)
      const state = stateSchema.parse(result.value)
      if (kind === 'start' && onStarted) {
        if (!state.task) throw new Error('扫描启动后没有返回扫描记录。')
        await onStarted(state.task)
      }
      success = true
    } catch (error) {
      if (this.live && version === this.version) { this.actionError = message(error); this.publish({ error: this.actionError }) }
    } finally {
      if (this.live && version === this.version) { this.publish({ busy: false }); void this.refresh() }
    }
    return success
  }
  async setFindingStatus(findingId: string, status: FindingStatus) {
    if (!this.live || this.snapshot.busy) return
    clearTimeout(this.timer)
    const version = ++this.version
    this.actionError = null
    this.publish({ busy: true, error: null })
    try {
      if (!this.snapshot.data?.capabilities.findingStatusEditing) throw new Error('状态编辑接口尚未加载，请完整退出并重新打开 DSH。')
      const result = await this.remote.setFindingStatus({ sessionId: this.sessionId, findingId, status })
      if (!this.live || version !== this.version) return
      if (!result.ok) throw new Error(result.error.message)
      this.publish({ data: dashboardSchema.parse(result.value) })
    } catch (error) {
      if (this.live && version === this.version) {
        this.actionError = /HTTP 404/.test(message(error)) ? '状态编辑接口尚未加载，请完整退出并重新打开 DSH。' : message(error)
        this.publish({ error: this.actionError })
      }
    } finally {
      if (this.live && version === this.version) { this.publish({ busy: false }); void this.refresh() }
    }
  }
  async repairFinding(findingId: string, openConversation: (id: string) => Promise<void>) {
    if (!this.live || this.snapshot.busy) return false
    clearTimeout(this.timer)
    const version = ++this.version
    this.actionError = null
    this.publish({ busy: true, error: null })
    try {
      const data = this.snapshot.data
      if (!data?.capabilities.findingRepair) throw new Error('修复接口尚未加载，请完整退出并重新打开 DSH。')
      const finding = data.findings.find(finding => finding.id === findingId)
      if (!finding || !canRepair(finding.status)) throw new Error('该发现已结束处置，请先重新打开其状态。')
      let repair = this.repairConversations.get(findingId)
      if (!repair) {
        const result = await this.remote.repairFinding({ sessionId: this.sessionId, findingId })
        if (!result.ok) throw new Error(result.error.message)
        repair = repairResultSchema.parse(result.value)
        if (repair.findingId !== findingId || repair.workspace !== data.workspace) throw new Error('修复会话与当前发现不匹配。')
        // 导航失败重试只打开已建会话，避免重复发送修复。 Retry navigation without launching another repair.
        this.repairConversations.set(findingId, repair)
      }
      if (!this.live || version !== this.version) return false
      await openConversation(repair.conversationId)
      this.repairConversations.delete(findingId)
      if (repair.warning) { this.actionError = repair.warning; this.publish({ error: repair.warning }) }
      return true
    } catch (error) {
      if (this.live && version === this.version) {
        this.actionError = /HTTP 404/.test(message(error)) ? '修复接口尚未加载，请完整退出并重新打开 DSH。' : message(error)
        this.publish({ error: this.actionError })
      }
      return false
    } finally {
      if (this.live && version === this.version) { this.publish({ busy: false }); void this.refresh() }
    }
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error) }
