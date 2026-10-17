import { active, stateSchema, type SecurityRemote, type Task, type Stage } from './contracts.ts'

export const phaseLabels = {
  preflight: '准备扫描', threat_model: '分析代码与威胁模型', discovery: '检查潜在漏洞',
  validation: '验证候选发现', attack_path: '核对攻击路径', reporting: '生成安全报告',
}
export const stageLabels: Record<Stage, string> = {
  checking_workspace: '检查工作区', inventory: '枚举仓库文件', snapshot: '记录仓库快照',
  registering: '建立扫描记录', initializing: '初始化审计工具', awaiting_model: '模型审计',
  threat_model: '梳理代码与威胁模型', discovery: '检查潜在漏洞', validation: '验证候选发现',
  attack_path: '核对攻击路径', reporting: '生成安全报告',
}
export const activityLabels = {
  waiting_response: '等待模型响应', thinking: '模型正在分析', responding: '模型正在生成输出',
  preparing_tool: '准备读取或检查', processing_results: '整理检查结果', request_failed: '模型请求失败，等待处理',
  model: '模型分析中', read: '正在读取代码', glob: '正在查找文件', grep: '正在搜索代码',
  saving: '正在保存检查点', reporting: '正在校验并生成报告',
}
export function activitySummary(task: Task): string {
  if (!task.activity) return stageLabels[currentStage(task)]
  const action = activityLabels[task.activity]
  return task.activityTarget ? `${action} · ${task.activityTarget === '.' ? '仓库根目录' : task.activityTarget}` : action
}
export function activityFreshness(task: Task, now: number): string {
  if (!task.lastActivityAt) return task.stage ? '等待活动更新' : '当前后台仅提供阶段进度'
  const seconds = Math.max(0, Math.floor((now - Date.parse(task.lastActivityAt)) / 1000))
  return seconds < 5 ? '刚收到活动更新' : `最近活动 ${elapsedLabel(task.lastActivityAt, now)}前`
}
export function currentStage(task: Task): Stage {
  return task.stage ?? (task.phase === 'preflight' ? (task.scanId ? 'awaiting_model' : 'checking_workspace') : task.phase)
}
export function elapsedLabel(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000)) || 0
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`
}
export type ProgressSnapshot = { task: Task | null; error: string | null; stopping: boolean }

/** Session-scoped read-only observation. It never starts or resumes a scan. */
export class ProgressObserver {
  private snapshot: ProgressSnapshot = { task: null, error: null, stopping: false }
  private listeners = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private running = false
  private version = 0
  private actionError: string | null = null
  constructor(private remote: Pick<SecurityRemote, 'state' | 'cancel'>, private sessionId: string) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private publish(change: Partial<ProgressSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change }
    for (const listener of this.listeners) listener()
  }
  start() {
    if (this.running) return
    this.running = true
    void this.refresh()
  }
  dispose() {
    this.running = false
    this.version++
    clearTimeout(this.timer)
  }
  async refresh() {
    if (!this.running || this.snapshot.stopping) return
    clearTimeout(this.timer)
    const version = ++this.version
    try {
      const result = await this.remote.state({ sessionId: this.sessionId })
      if (!this.running || version !== this.version) return
      if (!result.ok) throw new Error(result.error.message)
      const { task } = stateSchema.parse(result.value)
      if (task?.id !== this.snapshot.task?.id) this.actionError = null
      this.publish({ task: active(task) ? task : null, error: this.actionError })
    } catch (error) {
      if (this.running && version === this.version) this.publish({ error: errorMessage(error) })
    } finally {
      if (this.running && version === this.version) this.timer = setTimeout(() => { void this.refresh() }, 1000)
    }
  }
  async cancel() {
    if (!this.running || !this.snapshot.task || this.snapshot.stopping) return
    const version = ++this.version
    clearTimeout(this.timer)
    this.actionError = null
    this.publish({ stopping: true, error: null })
    try {
      const result = await this.remote.cancel({ sessionId: this.sessionId })
      if (!this.running || version !== this.version) return
      if (!result.ok) throw new Error(result.error.message)
      const { task } = stateSchema.parse(result.value)
      this.publish({ task: active(task) ? task : null })
    } catch (error) {
      if (this.running && version === this.version) {
        this.actionError = errorMessage(error)
        this.publish({ error: this.actionError })
      }
    } finally {
      if (this.running && version === this.version) {
        this.publish({ stopping: false })
        this.timer = setTimeout(() => { void this.refresh() }, 1000)
      }
    }
  }
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }
