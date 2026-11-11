import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { active, taskSchema, type State, type Task, type Phase } from './contracts.ts'

export interface RunHooks {
  signal: AbortSignal
  cancel?(): void
  update(change: Partial<Pick<Task, 'scanId' | 'phase' | 'findings' | 'completed' | 'total' | 'reportPath' | 'usage' | 'conversationId'>>): Promise<void>
}
export interface ScanDriver {
  run(task: Task, hooks: RunHooks): Promise<void>
  stop(task: Task, cancelled: boolean, error: string): Promise<void>
}

/** Owns only task lifetime and persistence; model driving belongs to DSH. */
export class SecurityManager {
  private tasks = new Map<string, Task>()
  private history = new Map<string, Task>()
  private runs = new Map<string, { controller: AbortController; settled: Promise<void>; published: Promise<void>; publish: () => void }>()
  private writes: Promise<void> = Promise.resolve()
  private disposed = false
  readonly ready: Promise<void>

  constructor(private directory: string, private driver: ScanDriver) {
    this.ready = this.restore()
  }

  private async restore() {
    let saved: unknown
    try { saved = JSON.parse(await readFile(join(this.directory, 'tasks.json'), 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    if (!Array.isArray(saved)) throw new Error('Invalid Security state; original file preserved')
    for (const value of saved) {
      const task = taskSchema.parse(value)
      if (this.history.has(task.id)) throw new Error('Duplicate task in Security state')
      this.history.set(task.id, task)
      this.tasks.set(task.workspace, task)
    }
    for (const task of this.history.values()) {
      if (!active(task)) continue
      await this.driver.stop(task, false, 'DSH stopped before the scan completed')
      task.status = 'interrupted'
      task.error = 'DSH 已停止，扫描未完成；已保留检查点。'
      task.updatedAt = new Date().toISOString()
    }
    await this.save()
  }

  private save() {
    const content = JSON.stringify([...this.history.values()], null, 2) + '\n'
    const write = this.writes.then(async () => {
      await mkdir(this.directory, { recursive: true })
      const temporary = join(this.directory, `tasks-${randomUUID()}.tmp`)
      await writeFile(temporary, content, { flag: 'wx' })
      await rename(temporary, join(this.directory, 'tasks.json'))
    })
    // A rejected write is visible to its caller; later terminal writes can still persist.
    this.writes = write.catch(() => {})
    return write
  }

  async state(workspace: string): Promise<State> {
    await this.ready
    return { workspace, task: structuredClone(this.tasks.get(workspace) ?? null) }
  }

  async list(workspace: string): Promise<Task[]> {
    await this.ready
    return structuredClone([...this.history.values()].filter(task => task.workspace === workspace).reverse())
  }

  async start(workspace: string, sessionId: string, provider: string, model: string, reasoningEffort?: string, instructions?: string, scope = '.', options: { ultra?: boolean; conversation?: boolean } = {}): Promise<State> {
    await this.ready
    if (this.disposed) throw new Error('Security plugin has been disposed')
    if (this.runs.has(workspace)) return this.state(workspace)
    const now = new Date().toISOString()
    const task: Task = { id: randomUUID(), workspace, sessionId, provider, model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(instructions ? { instructions } : {}),
      status: 'starting', phase: 'preflight', findings: 0, startedAt: now, updatedAt: now }
    task.scope = scope
    if (options.ultra) task.ultra = true
    if (options.conversation) task.conversation = true
    task.timeline = [{ at: now, phase: 'preflight' }]
    const controller = new AbortController()
    this.tasks.set(workspace, task)
    this.history.set(task.id, task)
    // Claim synchronously before any filesystem await; double-clicks share this run.
    let publish!: () => void
    const published = new Promise<void>(resolve => { publish = resolve })
    const running = { controller, settled: Promise.resolve(), published, publish }
    this.runs.set(workspace, running)
    running.settled = this.execute(task, controller).finally(() => { publish(); this.runs.delete(workspace) })
    return this.state(workspace)
  }

  async conversation(workspace: string, taskId: string): Promise<State> {
    await this.ready
    const task = this.tasks.get(workspace)
    if (!task || task.id !== taskId) throw new Error('扫描任务已变化，请刷新工作台。')
    const run = this.runs.get(workspace)
    if (!run) {
      if (task.conversationId) return this.state(workspace)
      throw new Error(task.error || '扫描会话创建失败。')
    }
    // 会话发布后即返回，不等待模型扫描结束。 Return after publication, before audit completion.
    await run.published
    if (!task.conversationId) throw new Error(task.error || '扫描会话创建失败。')
    return this.state(workspace)
  }

  private async execute(task: Task, controller: AbortController) {
    try {
      await this.save()
      controller.signal.throwIfAborted()
      task.status = 'running'
      await this.driver.run(task, {
        signal: controller.signal,
        cancel: () => controller.abort(new Error('扫描会话已停止。')),
        update: async change => {
          // scanId must be retained even when cancellation races scan registration.
          if (change.scanId) task.scanId = change.scanId
          if (change.conversationId) task.conversationId = change.conversationId
          if (change.usage) task.usage = change.usage
          controller.signal.throwIfAborted()
          if (change.phase && task.timeline?.at(-1)?.phase !== change.phase) {
            task.timeline?.push({ at: new Date().toISOString(), phase: change.phase })
          }
          Object.assign(task, change, { updatedAt: new Date().toISOString() })
          await this.save()
          if (change.conversationId) this.runs.get(task.workspace)?.publish()
        },
      })
      controller.signal.throwIfAborted()
      if (!task.reportPath) throw new Error('Scan returned without a verified report')
      task.status = 'completed'
    } catch (error) {
      task.status = controller.signal.aborted ? 'cancelled' : 'failed'
      task.error = controller.signal.aborted ? '扫描已取消，已有检查点保留。' : errorMessage(error)
      try { await this.driver.stop(task, controller.signal.aborted, task.error) }
      catch (stopError) { task.error += `；workbench 状态保存失败：${errorMessage(stopError)}` }
    } finally {
      task.updatedAt = new Date().toISOString()
      try { await this.save() }
      catch (error) {
        task.status = 'failed'
        task.error = `扫描状态未能保存：${errorMessage(error)}`
      }
    }
  }

  async cancel(workspace: string, taskId?: string): Promise<State> {
    await this.ready
    const run = this.runs.get(workspace)
    const task = this.tasks.get(workspace)
    if (taskId && task?.id !== taskId) throw new Error('扫描任务已变化，请刷新后重试。')
    if (run && task) {
      task.status = 'cancelling'
      run.controller.abort(new Error('User cancelled Security scan'))
      await run.settled
    }
    return this.state(workspace)
  }

  /** Keep the native tool call alive, and drain its scan when chat Stop aborts it. */
  async wait(workspace: string, taskId: string, signal: AbortSignal): Promise<Task> {
    const task = this.tasks.get(workspace)
    if (!task || task.id !== taskId) throw new Error('Security task was replaced')
    const run = this.runs.get(workspace)
    const cancel = () => run?.controller.abort(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      if (signal.aborted) cancel()
      await run?.settled
      signal.throwIfAborted()
      return structuredClone(task)
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  async dispose() {
    this.disposed = true
    await this.ready
    const runs = [...this.runs.values()]
    for (const run of runs) run.controller.abort(new Error('Security plugin disposed'))
    await Promise.all(runs.map(run => run.settled))
    await this.writes
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
