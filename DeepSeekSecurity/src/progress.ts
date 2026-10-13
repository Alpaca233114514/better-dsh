import { active, stateSchema, type SecurityRemote, type Task } from './contracts.ts'

export const phaseLabels = {
  preflight: '准备扫描', threat_model: '分析代码与威胁模型', discovery: '检查潜在漏洞',
  validation: '验证候选发现', attack_path: '核对攻击路径', reporting: '生成安全报告',
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
