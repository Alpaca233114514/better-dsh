import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { startSchema, detailRequestSchema, findingStatusRequestSchema, findingRequestSchema, type FindingRequest, type RepairResult, type FindingStatusRequest, type Request, type StartRequest, type DetailRequest, type Details } from './contracts.ts'
import { startFindingRepair } from './repair.ts'
import { FindingState } from './finding-state.ts'
import { scanScope } from './workspace-tools.ts'
import { projectFindings } from './dashboard.ts'
import { SecurityManager } from './manager.ts'
import { Workbench } from './workbench.ts'
import { DshScanDriver } from './driver.ts'
import { contribution } from './remote.ts'
import { scanWorkspace, securityTools } from './tools.ts'
import { ultraService, supportsUltra } from './ultra.ts'

export interface Config { stateDirectory?: string; python?: string }
export const inject = ['agents', 'sessions', 'sessionPersistence', 'sessionController', 'sessionProjections', 'agentDefaultModel', 'llm', 'tools', 'sandboxPolicy', 'typert']

class SecurityService extends TypertRemoteService {
  private findingState: FindingState
  private reports = new Map<string, Details>()
  private workspaces = new Map<string, string>()
  private workspaceReads = new Map<string, Promise<string | undefined>>()
  private repairs = new Map<string, Promise<RepairResult>>()
  constructor(ctx: Context, private manager: SecurityManager, private workbench: Workbench) {
    super(ctx, 'deepseekSecurity')
    this.findingState = new FindingState(workbench.stateDirectory)
  }

  private async session(request: Request) {
    const id = request.sessionId as SessionId
    const session = this.ctx.sessions.get(id)
    // 浏览冷会话只取持久化头，不激活 Agent。 Cold reads only stat the stored header.
    let cwd = session?.header.cwd ?? this.workspaces.get(id)
    if (!cwd) {
      let reading = this.workspaceReads.get(id)
      if (!reading) {
        // 并发请求共用一次元数据读取，只保留不可变 cwd。 Share metadata reads; retain only immutable cwd.
        reading = this.ctx.sessionPersistence.stat(id).then(snapshot => {
          if (!snapshot) throw new Error('仓库会话不存在，请重新选择仓库。')
          if (snapshot.header.cwd) this.workspaces.set(id, snapshot.header.cwd)
          return snapshot.header.cwd
        }).finally(() => this.workspaceReads.delete(id))
        this.workspaceReads.set(id, reading)
      }
      cwd = await reading
    }
    if (!cwd) throw new Error('该仓库会话没有工作区路径，请重新选择仓库。')
    const workspace = await scanWorkspace(cwd, this.workbench.stateDirectory)
    return { session, workspace }
  }

  @Remote
  async state(request: Request) {
    return this.manager.state((await this.session(request)).workspace)
  }

  @Remote
  async start(request: StartRequest) {
    request = startSchema.parse(request)
    const { session, workspace } = await this.session(request)
    const selected = session ? this.ctx.sessionProjections.stateOf(session, 'modelSelection') : null
    const model = selected?.pending ?? selected?.lastUsed ?? this.ctx.agentDefaultModel.currentSelection()
    if (!model) throw new Error('请先为当前会话选择 DSH 模型。')
    const scope = await scanScope(workspace, request.scope)
    const provider = request.provider ?? model.provider
    const selectedModel = request.model ?? model.model
    if (!this.ctx.llm.listProviders().some(item => item.id === provider)) throw new Error('所选模型服务已不可用。')
    if (request.reasoningEffort === 'ultra') throw new Error('Ultra 须通过插件模式启用，不能作为模型推理参数。')
    if (request.ultra) {
      const info = await this.ctx.llm.resolveModelInfo(provider, selectedModel)
      if (!supportsUltra(this.ctx, provider, selectedModel, selectedModel, info.reasoning?.efforts.map(value => String(value.id)) ?? [])) {
        throw new Error('当前模型或 Ultra 插件暂不可用，请选择其他推理强度。')
      }
    }
    const started = await this.manager.start(workspace, request.sessionId, provider, selectedModel,
      request.ultra ? 'max' : request.reasoningEffort ?? (provider === model.provider && selectedModel === model.model ? model.reasoningEffort : undefined), request.instructions, scope,
      { conversation: true, ultra: request.ultra })
    return this.manager.conversation(workspace, started.task!.id)
  }

  @Remote
  async cancel(request: DetailRequest) {
    request = detailRequestSchema.parse(request)
    return this.manager.cancel((await this.session(request)).workspace, request.taskId)
  }

  @Remote
  async details(request: DetailRequest) {
    request = detailRequestSchema.parse(request)
    const { workspace } = await this.session(request)
    const task = request.taskId ? (await this.manager.list(workspace)).find(task => task.id === request.taskId)
      : (await this.manager.state(workspace)).task
    if (task?.status !== 'completed' || !task.scanId) throw new Error('当前没有已完成的安全报告。')
    return this.workbench.details(task.scanId)
  }

  @Remote
  async dashboard(request: Request) {
    const { session, workspace } = await this.session(request)
    const tasks = await this.manager.list(workspace)
    const warnings: string[] = []
    const reports: { task: typeof tasks[number]; details: Details }[] = []
    for (const task of tasks) {
      if (task.status !== 'completed' || !task.scanId) continue
      try {
        let details = this.reports.get(task.id)
        if (!details) { details = await this.workbench.details(task.scanId); this.reports.set(task.id, details) }
        reports.push({ task, details })
      } catch { warnings.push(`扫描 ${task.id.slice(0, 8)} 的报告读取失败。`) }
    }
    const selected = session ? this.ctx.sessionProjections.stateOf(session, 'modelSelection') : null
    const selection = selected?.pending ?? selected?.lastUsed ?? this.ctx.agentDefaultModel.currentSelection() ?? null
    const statuses = await this.findingState.statuses(workspace)
    return { workspace, tasks, findings: projectFindings(reports).map(finding => ({ ...finding, status: statuses.get(finding.id) ?? 'new' })), warnings, capabilities: { findingStatusEditing: true, findingRepair: true }, selection: selection && { ...selection, ultra: !!session && !!ultraService(this.ctx)?.active(session) } }
  }

  @Remote
  async setFindingStatus(request: FindingStatusRequest) {
    request = findingStatusRequestSchema.parse(request)
    const dashboard = await this.dashboard(request)
    if (!dashboard.findings.some(finding => finding.id === request.findingId)) throw new Error('该安全发现不属于当前仓库，或报告尚不可用。')
    await this.findingState.set(dashboard.workspace, request.findingId, request.status)
    return this.dashboard(request)
  }

  @Remote
  async repairFinding(request: FindingRequest) {
    request = findingRequestSchema.parse(request)
    const dashboard = await this.dashboard(request)
    const finding = dashboard.findings.find(finding => finding.id === request.findingId)
    const task = dashboard.tasks.find(task => task.id === finding?.taskId)
    if (!finding || !task) throw new Error('该安全发现不属于当前仓库，或报告尚不可用。')
    const key = JSON.stringify([dashboard.workspace, finding.id])
    let pending = this.repairs.get(key)
    if (!pending) {
      pending = (async () => {
        const result = await startFindingRepair(this.ctx, dashboard.workspace, finding, task, dashboard.selection, request.sessionId)
        try { await this.findingState.set(dashboard.workspace, finding.id, 'in_progress') }
        catch { return { ...result, warning: '修复会话已启动，但“处理中”状态保存失败，请稍后检查。' } }
        return result
      })().finally(() => this.repairs.delete(key))
      this.repairs.set(key, pending)
    }
    return pending
  }

  @Remote
  async models(request: Request) {
    await this.session(request)
    const catalogs = await Promise.all(this.ctx.llm.listProviders().map(async provider => {
      const models = await this.ctx.llm.listModels(provider.id)
      return Promise.all(models.map(async model => {
        const info = await this.ctx.llm.resolveModelInfo(provider.id, model.id)
        const efforts = info.reasoning?.efforts.map(effort => String(effort.id)) ?? []
        return { provider: provider.id, model: model.id, label: model.name, efforts, ultra: supportsUltra(this.ctx, provider.id, model.id, model.name, efforts) }
      }))
    }))
    return catalogs.flat()
  }
}

export function apply(ctx: Context, config: Config = {}) {
  const directory = config.stateDirectory ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'state', 'deepseek-security')
  const workbench = new Workbench(directory, config.python ?? (process.platform === 'win32' ? 'python' : 'python3'))
  const manager = new SecurityManager(directory, new DshScanDriver(ctx, workbench))
  // Observe boot failure without hiding it: every RPC awaits the same rejected ready promise.
  void manager.ready.catch(() => {})
  ctx.typert.remotes.register(contribution)
  new SecurityService(ctx, manager, workbench)
  for (const tool of securityTools(manager, workbench)) ctx.tools.register(tool)
  ctx.effect(() => () => manager.dispose())
}
