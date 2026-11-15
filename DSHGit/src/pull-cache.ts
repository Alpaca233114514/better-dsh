/** Bound work across all panels. 所有面板共用并发额度与按权限隔离的只读快照。 */
export class PullCache<T> {
  private values = new Map<string, { value: T; at: number }>()
  private pending = new Map<string, Promise<T>>()
  private running = 0
  private queue: Array<() => void> = []

  read(key: string, force: boolean, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key)
    if (existing) return existing
    const cached = this.values.get(key)
    if (!force && cached && Date.now() - cached.at < 600_000) return Promise.resolve(cached.value)
    const run = async () => {
      if (this.running < 2) this.running++
      else await new Promise<void>(resolve => this.queue.push(resolve))
      try {
        const value = await load()
        this.values.delete(key)
        this.values.set(key, { value, at: Date.now() })
        if (this.values.size > 32) this.values.delete(this.values.keys().next().value!)
        return value
      } finally {
        const next = this.queue.shift()
        if (next) next()
        else this.running--
      }
    }
    const task = run().finally(() => this.pending.delete(key))
    this.pending.set(key, task)
    return task
  }
}
