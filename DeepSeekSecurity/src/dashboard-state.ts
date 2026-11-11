import { dashboardSchema, stateSchema, type Dashboard, type FindingStatus, type SecurityRemote, type StartRequest, type Task } from './contracts.ts'

export type DashboardSnapshot = { data: Dashboard | null; error: string | null; loading: boolean; busy: boolean }

/** 观察不启动任务；版本号隔离迟到响应。 Observation never launches work; versions reject stale responses. */
export class DashboardObserver {
  private snapshot: DashboardSnapshot = { data: null, error: null, loading: true, busy: false }
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private live = false
  private version = 0
  private actionError: string | null = null
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
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error) }
