import { watch, type FSWatcher } from 'node:fs'

export type Invalidation = string[] | null
type Listener = (path: string | null, error?: Error) => void
type Entry = { listeners: Set<Listener>; watchers: FSWatcher[] }

/** One native watch per worktree; 同一工作树共享原生监听。 */
export class RepositoryWatches {
  private entries = new Map<string, Entry>()
  constructor(private observe: typeof watch = watch) {}

  async *follow(paths: string[], signal: AbortSignal, accept: (path: string) => boolean = () => true): AsyncIterable<Invalidation> {
    signal.throwIfAborted()
    const key = process.platform === 'win32' ? paths[0].toLowerCase() : paths[0]
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { listeners: new Set(), watchers: [] }
      const current = entry
      try {
        for (const path of new Set(paths)) {
          const watcher = this.observe(path, { recursive: true }, (_event, filename) => {
            const name = String(filename ?? '').replaceAll('\\', '/')
            const metadata = path !== paths[0] || name === '.git' || name.startsWith('.git/')
            const relative = name.replace(/^\.git\//, '')
            // Read/pack noise is not a state change; 排除锁文件、对象与日志噪声。
            if (metadata && (name.endsWith('.lock') || /^(objects|logs)(\/|$)/.test(relative))) return
            for (const listener of current.listeners) listener(!name || metadata ? null : name)
          })
          watcher.on('error', error => { for (const listener of current.listeners) listener(null, error) })
          current.watchers.push(watcher)
        }
        this.entries.set(key, entry)
      } catch (error) { for (const watcher of current.watchers) watcher.close(); throw error }
    }
    let initial = true, failure: Error | undefined, wake: (() => void) | undefined
    let full = false, pending = new Set<string>(), ready = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const changed: Listener = (path, error) => {
      if (error) { failure = error; wake?.(); return }
      if (path !== null && !accept(path)) return
      if (path === null) full = true
      else pending.add(path)
      if (pending.size > 128) { full = true; pending.clear() }
      if (!timer) timer = setTimeout(() => { timer = undefined; ready = true; wake?.() }, 250)
    }
    const abort = () => wake?.()
    entry.listeners.add(changed)
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!signal.aborted) {
        if (failure) throw failure
        if (initial) { initial = false; yield null; continue }
        if (ready) {
          const batch = full ? null : [...pending]
          full = false; pending = new Set(); ready = false
          yield batch; continue
        }
        await new Promise<void>(resolve => { wake = resolve })
        wake = undefined
      }
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      entry.listeners.delete(changed)
      if (!entry.listeners.size) {
        for (const watcher of entry.watchers) watcher.close()
        this.entries.delete(key)
      }
    }
  }
}
