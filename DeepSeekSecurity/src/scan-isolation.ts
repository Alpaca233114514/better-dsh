import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import type { Task } from './contracts.ts'

const coordination = new Set(['subagent', 'spawn', 'fork', 'list_subagent_models', 'spawn_teammate',
  'list_agents', 'send_message', 'wait_agent', 'interrupt_agent',
  'team_task_create', 'team_task_list', 'team_task_get', 'team_task_update'])
const reporting = new Set(['security_progress', 'record_codex_security_scan_draft', 'complete_codex_security_scan'])
const ended = '本次扫描已结束，请从安全管理界面发起新扫描。'
const denied = 'Security scan isolation: only scan-owned readers, reporting and authorized coordination may execute.'

interface Run {
  task: Task
  readers: readonly ToolDefinition[]
  active: boolean
  ids: Set<string>
  agents: Set<Agent>
  finishing?: Promise<void>
}
interface Boundary {
  run: Run
  allowed: Map<string, ToolDefinition>
  installed: boolean
}

/** Pins scan capabilities to each exact Agent, including native descendants. */
export class ScanIsolation {
  private roots = new Map<string, Run>()
  private lineage = new Map<string, Run>()
  private endedIds = new Set<string>()
  private boundaries = new WeakMap<Agent, Boundary>()

  constructor(private ctx: Context) {
    ctx.on('agent/created', async ({ agent, signal }) => {
      signal?.throwIfAborted()
      await this.isolate(agent)
      signal?.throwIfAborted()
    })
    ctx.effect(() => () => Promise.all([...this.roots.values()].map(run => this.finish(run))))
  }

  track(task: Task, readers: readonly ToolDefinition[]): () => Promise<void> {
    if (this.roots.has(task.id)) throw new Error('Security scan isolation is already tracking this task')
    if (!isAbsolute(task.workspace)) throw new Error('Security scan workspace must be absolute')
    const names = new Set(readers.map(tool => tool.name))
    if (names.size !== readers.length || readers.some(tool => !['read', 'glob', 'grep'].includes(tool.name))) {
      throw new Error('Security scan isolation accepts only scan-owned read/glob/grep definitions')
    }
    const run: Run = { task: { ...task }, readers: [...readers], active: true, ids: new Set([task.id]), agents: new Set() }
    this.roots.set(task.id, run)
    this.lineage.set(task.id, run)
    return () => this.finish(run)
  }

  owns(rootTaskId: string, sessionId: string): boolean {
    const run = this.lineage.get(sessionId)
    return !!run && run.task.id === rootTaskId
  }

  /** Authorize a root-owned reporting definition after the driver registers it. */
  allow(agent: Agent, definition: ToolDefinition): void {
    const boundary = this.boundary(agent)
    if (!boundary || !boundary.run.active || agent.id !== boundary.run.task.id || !reporting.has(definition.name)) {
      throw new Error('Only the active scan root may authorize scan reporting tools')
    }
    if (agent.ctx.tools.get(definition.name, agent) !== definition) throw new Error('Scan reporting tool must be registered before authorization')
    boundary.allowed.set(definition.name, definition)
  }

  private boundary(agent: Agent): Boundary | undefined {
    const existing = this.boundaries.get(agent)
    if (existing) return existing
    if (this.endedIds.has(agent.id) || (agent.session.header.parentSession && this.endedIds.has(agent.session.header.parentSession))) {
      throw new Error(ended)
    }
    let run = this.lineage.get(agent.id) ?? (agent.session.header.parentSession
      ? this.lineage.get(agent.session.header.parentSession) : undefined)
    if (!run) for (const parent of this.ctx.agents.list()) {
      if (this.ctx.agents.isOwnedBy(agent.id, parent)) {
        run = this.boundaries.get(parent)?.run
        if (run) break
      }
    }
    if (!run) return
    if (!run.active) throw new Error(ended)
    const boundary: Boundary = { run, allowed: new Map(), installed: false }
    this.boundaries.set(agent, boundary)
    run.ids.add(agent.id)
    run.agents.add(agent)
    this.lineage.set(agent.id, run)
    return boundary
  }

  async isolate(agent: Agent) {
    const boundary = this.boundary(agent)
    if (!boundary) return
    const run = boundary.run
    if (!run.active) throw new Error(ended)
    if (boundary.installed) return
    // 先装单调拒绝，再进行异步路径核验。 Install the denial before asynchronous path checks.
    const reason = (name: string) => {
      if (!run.active) return ended
      const actual = agent.ctx.tools.get(name, agent)
      if (!actual || boundary.allowed.get(name) !== actual) return denied
    }
    agent.ctx.tools.guard(exec => reason(exec.name))
    agent.ctx.on('tools/execute', async (exec, next) => {
      const refusal = reason(exec.name)
      if (refusal) throw new Error(refusal)
      return next()
    })
    setSandboxMode(agent.session, 'read-only')
    this.nativePresentation(agent, run.readers)
    const [workspace, cwd] = await Promise.all([
      realpath(run.task.workspace), agent.session.header.cwd ? realpath(agent.session.header.cwd) : Promise.reject(new Error('Scan Agent has no workspace')),
    ])
    const tail = relative(workspace, cwd)
    if (tail === '..' || tail.startsWith(`..${sep}`) || isAbsolute(tail)) throw new Error('Security scan child working directory is outside the workspace')
    if (!run.active) throw new Error(ended)
    // 只固定创建时已存在的原生协调定义，后续同名注入不能扩大权限。
    // Pin existing native coordination identities; later same-name registrations cannot widen access.
    if (run.task.ultra) for (const name of coordination) {
      const definition = agent.ctx.tools.get(name, agent)
      if (definition) {
        this.register(agent, definition)
        boundary.allowed.set(name, definition)
      }
    }
    agent.ctx.tools.restrict({ allow: [] })
    for (const definition of run.readers) {
      this.register(agent, definition)
      boundary.allowed.set(definition.name, definition)
    }
    boundary.installed = true
  }

  private register(agent: Agent, definition: ToolDefinition) {
    try { agent.ctx.tools.register(definition) }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already registered in this scope') ||
        agent.ctx.tools.get(definition.name, agent) !== definition) throw error
    }
  }

  private nativePresentation(agent: Agent, readers: readonly ToolDefinition[]) {
    type Executor = { constructor: { name: string }; describe(tools: readonly ToolDefinition[]): { schemas: { name: string }[] } }
    type Presentation = { presentAs?: (mode: 'native') => unknown; selectExecutor?: () => Executor; setExecutor?: (executor: Executor) => unknown }
    const scoped = agent.ctx.tools as unknown as Presentation
    if (scoped.presentAs) { scoped.presentAs('native'); return }
    const executor = (this.ctx.tools as unknown as Presentation).selectExecutor?.()
    if (!executor || executor.constructor.name !== 'NativeToolExecutor' || !scoped.setExecutor) {
      throw new Error('Security scan requires an installed native tool executor')
    }
    const schemas = executor.describe(readers).schemas.map(schema => schema.name).sort()
    if (JSON.stringify(schemas) !== JSON.stringify(readers.map(reader => reader.name).sort())) {
      throw new Error('Security scan native executor does not expose exactly the bounded readers')
    }
    scoped.setExecutor(executor)
  }

  private finish(run: Run): Promise<void> {
    if (run.finishing) return run.finishing
    run.active = false
    let resolveDone!: () => void, rejectDone!: (error: unknown) => void
    run.finishing = new Promise<void>((resolve, reject) => { resolveDone = resolve; rejectDone = reject })
    const drains: Promise<unknown>[] = [], errors: unknown[] = []
    // 仅取消本扫描仍运行的后代，保留根会话转录和已装守卫。
    // Cancel only running descendants; preserve the root transcript and installed guards.
    for (const agent of run.agents) if (agent.id !== run.task.id) {
      try {
        if (agent.status === 'running') agent.cancel({ kind: 'user' })
        drains.push(agent.whenIdle())
      } catch (error) { errors.push(error) }
    }
    void Promise.allSettled(drains).then(results => {
      for (const result of results) if (result.status === 'rejected') errors.push(result.reason)
      this.roots.delete(run.task.id)
      for (const id of run.ids) {
        if (this.lineage.get(id) === run) this.lineage.delete(id)
        this.endedIds.add(id)
      }
      if (errors.length) rejectDone(new AggregateError(errors, 'Security scan descendants failed to drain'))
      else resolveDone()
    })
    return run.finishing
  }
}
