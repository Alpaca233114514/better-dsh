import type { GitRemote } from './contracts.ts'

/** Coalesce invalidations and serialize reads; 合并变更，查询期间只保留一次补刷。 */
export function followChanges(remote: () => GitRemote, sessionId: string, load: () => Promise<void>, error: (message: string) => void) {
  let stopped = false, running = false, dirty = false, timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined, retry = 1000
  const schedule = (delay = 300) => {
    dirty = true
    if (stopped || document.hidden || running || timer) return
    timer = setTimeout(() => { timer = undefined; void flush() }, delay)
  }
  const flush = async () => {
    if (stopped || document.hidden) return
    if (running) { dirty = true; return }
    dirty = false; running = true
    try { await load() } finally { running = false; if (dirty) schedule() }
  }
  const connect = async () => {
    if (stopped || document.hidden) return
    const current = new AbortController()
    controller = current
    try {
      const changes = remote().changes
      if (!changes) { await flush(); return }
      let first = true
      for await (const _frame of changes(sessionId, current.signal)) {
        if (current.signal.aborted || stopped) break
        retry = 1000
        if (first) { first = false; await flush() } else schedule()
      }
      if (!current.signal.aborted) throw new Error('文件监听连接已断开，正在重连。')
    } catch (e) {
      if (!stopped && !current.signal.aborted) {
        error((e as Error).message)
        reconnect = setTimeout(() => { reconnect = undefined; void connect() }, retry)
        retry = Math.min(retry * 2, 30000)
      }
    }
  }
  let reconnect: ReturnType<typeof setTimeout> | undefined
  const visibility = () => {
    controller?.abort(); clearTimeout(reconnect); reconnect = undefined
    clearTimeout(timer); timer = undefined
    if (!document.hidden) void connect()
  }
  document.addEventListener('visibilitychange', visibility)
  void connect()
  return () => {
    stopped = true; controller?.abort(); clearTimeout(timer); clearTimeout(reconnect)
    document.removeEventListener('visibilitychange', visibility)
  }
}
