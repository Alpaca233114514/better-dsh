import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-subprocess'
import { requestSchema, type Request } from './contracts.ts'
import { contribution } from './remote.ts'
import { GitRepository, type Runner } from './git.ts'

export const inject = ['sessions', 'typert', 'sandboxPolicy', 'sandbox', 'subprocess']
const mutations = new Set(['stage', 'unstage', 'commit', 'commitPush', 'push', 'switch', 'createBranch', 'createPR'])

class GitService extends TypertRemoteService {
  private busy = new Set<string>()
  private abort = new AbortController()
  constructor(ctx: Context) {
    super(ctx, 'dshgit')
    ctx.effect(() => () => this.abort.abort())
  }
  @Remote
  async run(request: Request) {
    request = requestSchema.parse(request)
    const session = this.ctx.sessions.get(request.sessionId as Parameters<Context['sessions']['get']>[0])
    if (!session?.header.cwd) throw new Error('请先打开工作区会话。')
    const policy = this.ctx.sandboxPolicy.resolve({ session })
    const write = mutations.has(request.action)
    if (write && policy.mode === 'read-only') throw new Error('当前会话为只读模式，Git 写操作不可用。')
    const runner: Runner = async (program, args, cwd, input, allowed = [0]) => {
      const timeout = AbortSignal.timeout(120000)
      const signal = AbortSignal.any([this.abort.signal, timeout])
      const executable = await this.ctx.subprocess.resolveExecutable(program, undefined, signal)
      const argv = [executable, ...args]
      // Use the host's actual confinement; never retry without it on denial.
      const wrapped = policy.mode === 'danger-full-access' ? argv :
        (await this.ctx.sandbox.confine(argv, { ...policy, mode: policy.mode }, signal)).argv
      const child = this.ctx.subprocess.spawn({
        argv: wrapped, cwd, graceMs: 1000, signal,
        env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' },
        stdio: { stdin: input === undefined ? 'ignore' : 'pipe',
          stdout: { maxBytes: 2 * 1024 * 1024 }, stderr: { maxBytes: 64000 } },
      })
      if (input !== undefined) { child.stdin?.on('error', () => {}); child.stdin?.end(input) }
      const result = await child.done
      const stdout = child.collected.stdout!.readFrom(0), stderr = child.collected.stderr!.readFrom(0)
      if (signal.aborted) throw new Error('操作超时或插件已卸载，请刷新确认实际 Git 状态。')
      if (result.exitCode === null || !allowed.includes(result.exitCode)) {
        // No argv, remote URLs, or credentials are persisted in plugin logs.
        throw new Error((stderr.text || stdout.text || `${program} 执行失败`).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1***@').slice(-4000))
      }
      if (stdout.lossy) throw new Error('输出过大，无法完整显示，请使用 Git 命令行查看。')
      return stdout.text
    }
    const repo = new GitRepository(runner)
    const root = (await runner('git', ['rev-parse', '--show-toplevel'], session.header.cwd)).trim()
    const key = process.platform === 'win32' ? root.toLowerCase() : root
    if (this.busy.has(key)) throw new Error('该仓库正在执行 Git 操作，请稍后重试。')
    if (write) this.busy.add(key)
    try {
      const result = await repo.execute(root, request)
      if (result.state) result.state.writable = policy.mode !== 'read-only'
      return result
    } finally { if (write) this.busy.delete(key) }
  }
}
export function apply(ctx: Context) {
  ctx.typert.remotes.register(contribution)
  new GitService(ctx)
}
