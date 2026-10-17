import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { active, taskSchema, type State, type Task, type Phase } from './contracts.ts'

export interface RunHooks {
  signal: AbortSignal
  update(change: Partial<Pick<Task, 'scanId' | 'phase' | 'stage' | 'activity' | 'activityTarget' | 'lastActivityAt' | 'filesRead' | 'searches' | 'files' | 'findings' | 'completed' | 'total' | 'reportPath'>>): Promise<void>
}
export interface ScanDriver {
  run(task: Task, hooks: RunHooks): Promise<void>
  stop(task: Task, cancelled: boolean, error: string): Promise<void>
}

/** Owns only task lifetime and persistence; model driving belongs to DSH. */
export class SecurityManager {
  private tasks = new Map<string, Task>()
  private runs = new Map<string, { controller: AbortController; settled: Promise<void> }>()
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
      if (this.tasks.has(task.workspace)) throw new Error('Duplicate workspace in Security state')
      this.tasks.set(task.workspace, task)
    }
    for (const task of this.tasks.values()) {
      if (!active(task)) continue
      await this.driver.stop(task, false, 'DSH stopped before the scan completed')
      task.status = 'interrupted'
      task.error = 'DSH 已停止，扫描未完成；已保留检查点。'
      task.updatedAt = new Date().toISOString()
    }
    await this.save()
  }

  private save() {
    const content = JSON.stringify([...this.tasks.values()], null, 2) + '\n'
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

  async start(workspace: string, sessionId: string, provider: string, model: string, reasoningEffort?: string, instructions?: string): Promise<State> {
    await this.ready
    if (this.disposed) throw new Error('Security plugin has been disposed')
    if (this.runs.has(workspace)) return this.state(workspace)
    const now = new Date().toISOString()
    const task: Task = { id: randomUUID(), workspace, sessionId, provider, model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(instructions ? { instructions } : {}),
      status: 'starting', phase: 'preflight', stage: 'checking_workspace', stageStartedAt: now,
      completedStages: [], findings: 0, startedAt: now, updatedAt: now }
    const controller = new AbortController()
    this.tasks.set(workspace, task)
    // Claim synchronously before any filesystem await; double-clicks share this run.
    const running = { controller, settled: Promise.resolve() }
    this.runs.set(workspace, running)
    running.settled = this.execute(task, controller).finally(() => this.runs.delete(workspace))
    return this.state(workspace)
  }

  private async execute(task: Task, controller: AbortController) {
    try {
      await this.save()
      controller.signal.throwIfAborted()
      task.status = 'running'
      await this.driver.run(task, {
        signal: controller.signal,
        update: async change => {
          // scanId must be retained even when cancellation races scan registration.
          if (change.scanId) task.scanId = change.scanId
          controller.signal.throwIfAborted()
          const now = new Date().toISOString()
          if (change.stage && change.stage !== task.stage) {
            // Only stages actually entered can be marked completed; skipped phases stay unmarked.
            task.completedStages = [...new Set([...(task.completedStages ?? []), ...(task.stage ? [task.stage] : [])])]
            task.stageStartedAt = now
          }
          if (change.activity && (change.activity !== task.activity || change.activityTarget !== task.activityTarget)) task.activityAt = now
          Object.assign(task, change, { updatedAt: now })
          await this.save()
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

  async cancel(workspace: string): Promise<State> {
    await this.ready
    const run = this.runs.get(workspace)
    const task = this.tasks.get(workspace)
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
