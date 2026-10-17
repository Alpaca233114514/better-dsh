import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './loader.mjs'
const { Config, apply } = await load('../src/index.ts')
test('Host schema supplies defaults and rejects malformed preferences', () => {
  const values = input => Object.fromEntries(Object.entries(Config(input)).map(([key, value]) => [key, value.get()]))
  assert.deepEqual(values({}), { enabled: true, sameWorkspace: true, wrapSessions: true })
  assert.throws(() => Config({ enabled: 'true' }))
  assert.deepEqual(values({ enabled: false, sameWorkspace: false, wrapSessions: false }), { enabled: false, sameWorkspace: false, wrapSessions: false })
})
test('Host settings are registered against the owning fiber and disposed', () => {
  let configured, disposed = false, cleanup
  const fiber = {}
  apply({ fiber, inject(names, fn) {
    assert.deepEqual(names, ['settings'])
    fn({ effect(fn) { cleanup = fn() }, settings: { configure(options, owner) { configured = { options, owner }; return () => { disposed = true } } } })
  } })
  assert.equal(configured.owner, fiber); assert.deepEqual(configured.options, { auto: true })
  cleanup(); assert.equal(disposed, true)
})
