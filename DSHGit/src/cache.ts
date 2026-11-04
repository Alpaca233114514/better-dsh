import { GitRepository, type GitSnapshot } from './git.ts'
import type { Request } from './contracts.ts'
import { RepositoryWatches, type Invalidation } from './watch.ts'

const normalized = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path

/** Host-owned snapshots outlive UI panels; 宿主缓存独立于界面挂载，变更按路径合并。 */
export class RepositoryCache {
  private jobs = 0
  get idle() { return !!this.snapshot && !this.listeners.size && this.jobs === 0 }
  private snapshot?: GitSnapshot
  private ignored = new Set<string>()
  private learnedIgnored = new Set<string>()
  private learnedAt = Date.now()
  private tracked = new Set<string>()
  private trackedFiles = new Set<string>()
  private queue: Promise<unknown> = Promise.resolve()
  private listeners = new Set<() => void>()
  private revision = 0
  private failure?: Error
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  readonly ready = new Promise<void>((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })

  constructor(readonly repo: GitRepository, readonly paths: string[], watches: RepositoryWatches, private signal: AbortSignal, failed: () => void) {
    void this.ready.catch(() => {})
    void (async () => {
      try {
        for await (const batch of watches.follow(paths, signal, path => !this.isIgnored(path))) await this.refresh(batch)
        if (!signal.aborted) throw new Error('文件监听已停止。')
      } catch (error) {
        this.failure = error as Error; this.rejectReady(this.failure); failed(); this.notify()
      } finally {
        if (signal.aborted) {
          this.failure = new Error('缓存已释放。'); this.rejectReady(this.failure); this.notify()
          await this.queue
          this.snapshot = undefined; this.repo.lastSnapshot = undefined
          this.ignored.clear(); this.tracked.clear(); this.trackedFiles.clear(); this.learnedIgnored.clear()
        }
      }
    })()
  }
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    this.jobs++
    const next = this.queue.then(job).finally(() => { this.jobs-- })
    this.queue = next.catch(() => {})
    return next
  }
  private notify() { this.revision++; for (const listener of this.listeners) listener() }
  private async indexFilters() {
    const read = async (args: string[]) => (await this.repo.run('git', ['ls-files', '-z', ...args], this.paths[0])).split('\0').filter(Boolean).map(normalized)
    this.learnedIgnored.clear(); this.learnedAt = Date.now()
    this.tracked = new Set()
    this.trackedFiles = new Set(await read(['--cached']))
    for (const path of this.trackedFiles) {
      const parts = path.split('/')
      while (parts.length) { this.tracked.add(parts.join('/')); parts.pop() }
    }
    this.ignored = new Set((await read(['--others', '--ignored', '--exclude-standard', '--directory'])).map(path => path.replace(/\/$/, '')))
  }
  private isIgnored(path: string) {
    if (Date.now() - this.learnedAt >= 10 * 60_000) { this.learnedIgnored.clear(); this.learnedAt = Date.now() }
    const key = normalized(path)
    if (this.tracked.has(key)) return false
    const parts = key.split('/')
    while (parts.length) { if (this.ignored.has(parts.join('/')) || this.learnedIgnored.has(parts.join('/'))) return true; parts.pop() }
    return false
  }
  refresh(batch: Invalidation) {
    return this.enqueue(async () => {
      this.signal.throwIfAborted()
      const full = !this.snapshot || batch === null || batch.some(path => /(^|\/)\.gitignore$|(^|\/)\.gitattributes$/.test(path))
      let paths = full ? [] : [...new Set(batch!.map(path => {
        const parts = path.split('/')
        while (parts.length > 1) {
          parts.pop()
          if (this.trackedFiles.has(normalized(parts.join('/')))) return parts.join('/')
        }
        return path
      }))].filter(path => !this.isIgnored(path))
      const unknown = new Set<string>()
      for (const path of paths) {
        if (this.tracked.has(normalized(path))) continue
        const parts = path.split('/')
        while (parts.length) { unknown.add(parts.join('/')); parts.pop() }
      }
      if (unknown.size) {
        // check-ignore rejects literal magic; ./ keeps filenames out of pathspec syntax.
        // 此只读命令不支持 literal 标记，以 ./ 前缀消除文件名的特殊路径语法。
        const ignored = await this.repo.run('git', ['--no-literal-pathspecs', 'check-ignore', '-z', '--stdin'], this.paths[0], [...unknown].map(path => './' + path).join('\0') + '\0', [0, 1])
        for (const path of ignored.split('\0').filter(Boolean)) {
          if (this.learnedIgnored.size >= 4096) this.learnedIgnored.delete(this.learnedIgnored.values().next().value!)
          this.learnedIgnored.add(normalized(path).replace(/^\.\//, '').replace(/\/$/, ''))
        }
        paths = paths.filter(path => !this.isIgnored(path))
      }
      if (!full && !paths.length) return
      if (full) {
        await this.repo.state(this.paths[0], true)
        await this.indexFilters()
        this.snapshot = this.repo.lastSnapshot!
      } else this.snapshot = await this.repo.incremental(this.snapshot!, paths)
      this.resolveReady(); this.notify()
    })
  }
  async read(force = false) {
    await this.ready
    if (force) await this.refresh(null)
    await this.queue
    if (this.failure) throw this.failure
    return this.snapshot!.state
  }
  async execute(request: Request, repo = this.repo) {
    await this.ready
    return this.enqueue(async () => {
      if (this.failure) throw this.failure
      const before = repo.lastSnapshot
      const cached = request.action === 'diff' || request.action === 'prInfo' ? this.snapshot!.state : undefined
      const result = await repo.execute(this.paths[0], request, true, cached)
      if (repo.lastSnapshot !== before) { this.snapshot = repo.lastSnapshot!; this.notify() }
      return result
    })
  }
  async *follow(signal: AbortSignal): AsyncIterable<{ changed: true }> {
    let seen = -1, wake: (() => void) | undefined
    const changed = () => wake?.()
    this.listeners.add(changed)
    signal.addEventListener('abort', changed, { once: true })
    try {
      await this.ready
      while (!signal.aborted) {
        if (this.failure) throw this.failure
        if (seen !== this.revision) { seen = this.revision; yield { changed: true }; continue }
        await new Promise<void>(resolve => { wake = resolve })
        wake = undefined
      }
    } finally { this.listeners.delete(changed); signal.removeEventListener('abort', changed) }
  }
}
