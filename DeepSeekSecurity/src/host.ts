import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Request } from './contracts.ts'
import { SecurityManager } from './manager.ts'
import { Workbench } from './workbench.ts'
import { DshScanDriver } from './driver.ts'
import { contribution } from './remote.ts'
import { scanWorkspace, securityTools } from './tools.ts'

export interface Config { stateDirectory?: string; python?: string }
export const inject = ['agents', 'agentPresets', 'sessions', 'sessionProjections', 'agentDefaultModel', 'tools', 'sandboxPolicy', 'typert']

class SecurityService extends TypertRemoteService {
  constructor(ctx: Context, private manager: SecurityManager, private workbench: Workbench) {
    super(ctx, 'deepseekSecurity')
  }

  private async session(request: Request) {
    const session = this.ctx.sessions.get(request.sessionId as SessionId)
    if (!session?.header.cwd) throw new Error('请先在 DSH 中打开工作区会话。')
    const workspace = await scanWorkspace(session.header.cwd, this.workbench.stateDirectory)
    return { session, workspace }
  }

  @Remote
  async state(request: Request) {
    return this.manager.state((await this.session(request)).workspace)
  }

  @Remote
  async start(request: Request) {
    const { session, workspace } = await this.session(request)
    const selected = this.ctx.sessionProjections.stateOf(session, 'modelSelection')
    const model = selected?.pending ?? selected?.lastUsed ?? this.ctx.agentDefaultModel.currentSelection()
    if (!model) throw new Error('请先为当前会话选择 DSH 模型。')
    return this.manager.start(workspace, session.id, model.provider, model.model, model.reasoningEffort)
  }

  @Remote
  async cancel(request: Request) {
    return this.manager.cancel((await this.session(request)).workspace)
  }

  @Remote
  async details(request: Request) {
    const { task } = await this.state(request)
    if (task?.status !== 'completed' || !task.scanId) throw new Error('当前没有已完成的安全报告。')
    return this.workbench.details(task.scanId)
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
