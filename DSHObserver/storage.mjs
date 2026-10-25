import { mkdir, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function createSink(directory, { warn = () => {}, limit = 10000 } = {}) {
  const file = join(directory, `run-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.jsonl`)
  let queue = [], pending = Promise.resolve(), flushing = null, dropped = 0, closed = false
  function write(row) {
    if (closed) return
    if (queue.length >= limit) { dropped++; return }
    queue.push(JSON.stringify(row) + '\n')
  }
  function flush() {
    if (flushing) return flushing
    if (!queue.length && !dropped) return pending
    const batch = queue; queue = []
    if (dropped) { batch.push(JSON.stringify({ schemaVersion: 1, kind: 'data-loss', dropped, time: Date.now() }) + '\n'); dropped = 0 }
    pending = pending.then(async () => {
      try { await mkdir(directory, { recursive: true }); await appendFile(file, batch.join(''), { encoding: 'utf8', mode: 0o600 }) }
      catch (error) {
        // A failed append may have written a prefix. Do not retry that batch and
        // duplicate records. The next successful batch carries an explicit gap.
        dropped += batch.length
        warn(`DSHObserver: persistence failed (${error.code ?? 'IO_ERROR'}); ${batch.length} records may be lost`)
      }
    }).finally(() => { flushing = null })
    flushing = pending
    return pending
  }
  return { file, write, flush, async close() { closed = true; await flush(); if (queue.length || dropped) await flush() } }
}
