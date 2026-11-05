import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-subprocess'
import { requestSchema, sessionSchema, type Result, type Request } from './contracts.ts'
import { contribution } from './remote.ts'
import { GitRepository, type Runner } from './git.ts'
import { descriptionGenerator } from './description.ts'

import { RepositoryWatches } from './watch.ts'
import { RepositoryCache } from './cache.ts'

export const inject = ['sessions', 'typert', 'sandboxPolicy', 'sandbox', 'subprocess', 'llm', 'sessionProjections']
const idleTTL = 10 * 60_000, maxIdleCaches = 16
type CacheRecord = { cache: Promise<RepositoryCache>; value?: RepositoryCache; abort: AbortController; sessions: Set<string>; lastUsed: number }
const mutations = new Set(['stage', 'unstage', 'commit', 'commitPush', 'push', 'switch', 'createBranch', 'createPR'])

class GitService extends TypertRemoteService {
  private watches = new RepositoryWatches()
  private caches = new Map<string, CacheRecord>()
  private sessionKeys = new Map<string, string>()
  private sessionSignals = new Map<string, AbortController>()
  private busy = new Set<string>()
  private abort = new AbortController()
  constructor(ctx: Context) {
    super(ctx, 'dshgit')
    ctx.effect(() => {
      const timer = setInterval(() => this.sweepCaches(), 60_000)
      timer.unref()
      return () => {
        clearInterval(timer); this.abort.abort()
        for (const key of this.caches.keys()) this.evictCache(key)
      }
    })
    let warming = Promise.resolve()
    const warm = (session: { id: string; header: { cwd?: string } }) => {
      if (session.header.cwd) warming = warming.then(() => this.getCache(session.id)).then(cache => cache.ready).catch(() => {})
    }
    ctx.on('session/created', warm)
    ctx.on('session/disposed', session => this.release(session.id))
    ctx.on('session/event', (session, event) => {
      if (event.type === 'sandbox/mode') { this.release(session.id); warm(session) }
    })
    for (const session of ctx.sessions.list()) warm(session)
  }
  @Remote({ mode: 'stream' })
  async *changes(sessionId: string, signal: AbortSignal): AsyncIterable<{ changed: true }> {
    sessionSchema.parse(sessionId)
    const cache = await this.getCache(sessionId)
    try { yield* cache.follow(AbortSignal.any([signal, this.abort.signal, this.sessionSignals.get(sessionId)!.signal])) }
    finally {
      const key = this.sessionKeys.get(sessionId)
      const record = key === undefined ? undefined : this.caches.get(key)
      if (record?.value === cache) record.lastUsed = Date.now()
    }
  }
  private evictCache(key: string) {
    const record = this.caches.get(key)
    if (!record) return
    this.caches.delete(key); record.abort.abort()
    for (const sessionId of record.sessions) {
      if (this.sessionKeys.get(sessionId) !== key) continue
      this.sessionKeys.delete(sessionId)
      this.sessionSignals.get(sessionId)?.abort(); this.sessionSignals.delete(sessionId)
    }
    record.sessions.clear()
  }
  private sweepCaches(now = Date.now()) {
    // Only unused snapshots expire; 不淘汰可见订阅或执行中的缓存，不触发 Git 查询。
    const retained: Array<[string, CacheRecord]> = []
    for (const [key, record] of this.caches) {
      if (!record.value?.idle) continue
      if (now - record.lastUsed >= idleTTL) this.evictCache(key)
      else retained.push([key, record])
    }
    if (retained.length <= maxIdleCaches) return
    retained.sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    for (let i = 0; i < retained.length - maxIdleCaches; i++) this.evictCache(retained[i][0])
  }
  private release(sessionId: string) {
    this.sessionSignals.get(sessionId)?.abort()
    this.sessionSignals.delete(sessionId)
    const key = this.sessionKeys.get(sessionId)
    if (key === undefined) return
    this.sessionKeys.delete(sessionId)
    const record = this.caches.get(key)
    record?.sessions.delete(sessionId)
    if (record && !record.sessions.size) this.evictCache(key)
  }
  private async getCache(sessionId: string): Promise<RepositoryCache> {
    const session = this.ctx.sessions.get(sessionId as Parameters<Context['sessions']['get']>[0])
    if (!session?.header.cwd) throw new Error('请先打开工作区会话。')
    const policy = this.ctx.sandboxPolicy.resolve({ session })
    // Do not merge different confinement policies; 缓存不跨越沙箱权限边界。
    const { sessionId: _identity, ...confinement } = policy
    const key = JSON.stringify([session.header.cwd, confinement])
    if (this.sessionKeys.get(sessionId) !== key) this.release(sessionId)
    this.sessionKeys.set(sessionId, key)
    if (!this.sessionSignals.has(sessionId)) this.sessionSignals.set(sessionId, new AbortController())
    let record = this.caches.get(key)
    if (!record) {
      const abort = new AbortController()
      const members = new Set([sessionId])
      const runner: Runner = (...args) => {
        // Reuse data, never an expired session authority; 共享缓存但每次执行重核会话权限。
        for (const member of members) {
          const current = this.ctx.sessions.get(member as Parameters<Context['sessions']['get']>[0])
          if (!current) continue
          const { sessionId: _id, ...limits } = this.ctx.sandboxPolicy.resolve({ session: current })
          if (JSON.stringify([current.header.cwd, limits]) === key) return this.runner(member, abort.signal)(...args)
        }
        return Promise.reject(new Error('工作区会话或权限已变化，请重新打开面板。'))
      }
      const cache = (async () => {
        const paths = (await runner('git', ['rev-parse', '--path-format=absolute', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'], session.header.cwd!)).trim().split(/\r?\n/)
        const value = new RepositoryCache(new GitRepository(runner), paths, this.watches,
          AbortSignal.any([abort.signal, this.abort.signal]), () => { if (this.caches.get(key)?.abort === abort) this.evictCache(key) })
        record!.value = value
        return value
      })()
      record = { cache, abort, sessions: members, lastUsed: Date.now() }
      this.caches.set(key, record)
      void cache.catch(() => { if (this.caches.get(key)?.abort === abort) this.evictCache(key) })
    }
    record.sessions.add(sessionId)
    record.lastUsed = Date.now()
    return record.cache
  }
  private runner(sessionId: string, lifetime = this.abort.signal): Runner {
    const session = this.ctx.sessions.get(sessionId as Parameters<Context['sessions']['get']>[0])
    if (!session?.header.cwd) throw new Error('请先打开工作区会话。')
    const policy = this.ctx.sandboxPolicy.resolve({ session })
    const execute = async (program: string, args: string[], cwd: string, input?: string, allowed = [0], env: Record<string, string> = {}) => {
      const timeout = AbortSignal.timeout(program === 'powershell.exe' ? 3000 : 120000)
      const signal = AbortSignal.any([this.abort.signal, lifetime, timeout])
      const executable = await this.ctx.subprocess.resolveExecutable(program, undefined, signal)
      const argv = [executable, ...args]
      // Use the host's actual confinement; never retry without it on denial.
      const wrapped = policy.mode === 'danger-full-access' ? argv :
        (await this.ctx.sandbox.confine(argv, { ...policy, mode: policy.mode }, signal)).argv
      const child = this.ctx.subprocess.spawn({
        argv: wrapped, cwd, graceMs: 1000, signal,
        env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' },
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
    const routes = new Map<string, string>()
    return async (program, args, cwd, input, allowed) => {
      const command = args[0] === '--no-pager' ? args[3] : args[0]
      if (program === 'git' && !['ls-remote', 'fetch', 'push'].includes(command)) return execute(program, args, cwd, input, allowed)
      let proxy = process.env.DSH_GIT_PROXY
      if (!proxy && process.platform === 'win32' && !['https_proxy', 'http_proxy', 'all_proxy'].some(name => process.env[name])) {
        let target = 'https://api.github.com'
        if (program === 'git') {
          const remote = await execute('git', ['remote', 'get-url', ...(command === 'push' ? ['--push'] : []), 'origin'], cwd)
          if (!/^https:\/\//i.test(remote)) return execute(program, args, cwd, input, allowed)
          target = new URL(remote.trim()).origin
        }
        // Resolve Windows bypass/PAC inside confinement. 在当前沙箱内解析目标的系统代理与绕过规则。
        if (!routes.has(target)) {
          const script = "$ErrorActionPreference = 'Stop'; $u = [uri][Console]::ReadLine(); $p = [Net.WebRequest]::GetSystemWebProxy().GetProxy($u); if ($p -and $p -ne $u) { $p.AbsoluteUri }"
          const route = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], cwd, target + '\n')
          routes.set(target, route.trim())
        }
        proxy = routes.get(target)
      }
      return execute(program, args, cwd, input, allowed, proxy ? { https_proxy: proxy, HTTPS_PROXY: proxy } : {})
    }
  }
  @Remote
  async run(request: Request): Promise<Result> {
    // SRC Gateway binds the parameter name; 保持 request 与远程描述一致。
    request = requestSchema.parse(request)
    const session = this.ctx.sessions.get(request.sessionId as Parameters<Context['sessions']['get']>[0])
    if (!session?.header.cwd) throw new Error('请先打开工作区会话。')
    const policy = this.ctx.sandboxPolicy.resolve({ session })
    const write = mutations.has(request.action)
    if (write && policy.mode === 'read-only') throw new Error('当前会话为只读模式，Git 写操作不可用。')
    const cache = await this.getCache(request.sessionId)
    if (request.action === 'state') return { state: { ...await cache.read(request.refresh), writable: policy.mode !== 'read-only' } }
    const root = cache.paths[0]
    const key = process.platform === 'win32' ? root.toLowerCase() : root
    if (this.busy.has(key)) throw new Error('该仓库正在执行 Git 操作，请稍后重试。')
    if (write) this.busy.add(key)
    try {
      const repo = new GitRepository(this.runner(request.sessionId), descriptionGenerator(this.ctx, session, this.abort.signal))
      const result = await cache.execute(request, repo)
      if (result.state) result.state.writable = policy.mode !== 'read-only'
      return result
    } finally { if (write) this.busy.delete(key) }
  }
}
export function apply(ctx: Context) {
  ctx.typert.remotes.register(contribution)
  new GitService(ctx)
}
