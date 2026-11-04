import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
await mkdir('.test-build', { recursive: true })
await build({ entryPoints: ['src/refresh.ts'], outfile: '.test-build/refresh.mjs', bundle: true, platform: 'node', format: 'esm' })
const { followChanges } = await import('../.test-build/refresh.mjs')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const tick = () => new Promise(resolve => setImmediate(resolve))

test('events coalesce, reads serialize, hidden pages unsubscribe and reconnect reads cache once', async () => {
  const document = new EventTarget(); document.hidden = false; globalThis.document = document
  let opened = 0, closed = 0, emit, calls = 0, active = 0, peak = 0, release
  const gate = new Promise(resolve => { release = resolve })
  const remote = { async *changes(_sessionId, signal) {
    opened++
    let dirty = true, wake
    emit = () => { dirty = true; wake?.() }
    const abort = () => wake?.()
    signal.addEventListener('abort', abort)
    try {
      while (!signal.aborted) {
        if (dirty) { dirty = false; yield { changed: true }; continue }
        await new Promise(resolve => { wake = resolve }); wake = undefined
      }
    } finally { closed++; signal.removeEventListener('abort', abort) }
  } }
  const errors = []
  const stop = followChanges(() => remote, 'test', async () => {
    const call = ++calls; active++; peak = Math.max(peak, active)
    try { if (call === 1) await gate } finally { active-- }
  }, error => errors.push(error))
  await tick()
  assert.equal(calls, 1)
  for (let i = 0; i < 50; i++) emit()
  release(); await pause(400)
  assert.equal(calls, 2)
  assert.equal(peak, 1)
  await pause(400)
  assert.equal(calls, 2)
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); await tick()
  assert.equal(closed, 1)
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await tick()
  assert.equal(opened, 2); assert.equal(calls, 3)
  stop(); await tick()
  assert.equal(closed, 2); assert.deepEqual(errors, [])
})
