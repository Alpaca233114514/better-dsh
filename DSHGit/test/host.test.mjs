import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
await mkdir('.test-build', { recursive: true })
await build({ entryPoints: ['src/host.ts'], outfile: '.test-build/host.mjs', bundle: true, platform: 'node', format: 'esm', target: 'es2022', external: ['@deepseek-ai/*', 'zod'] })
const plugin = await import('../.test-build/host.mjs')
async function bench(mode = 'workspace-write', deny = false, host = plugin) {
  const ctx = new Context(), spawns = [], wrapped = [], descriptors = []
  ctx.provide('typert', {
    remotes: { register: contribution => descriptors.push(contribution) },
    // Source-mode Host definitions are discovered from @Remote method signatures.
    // Registering a Client contribution does not populate the Host local registry.
    local: { get: () => undefined, hasSeen: () => false },
    lookups: { definitions: () => [] },
  })
  ctx.provide('sessions', { get: () => ({ id: 'test', header: { cwd: '/workspace' } }) })
  ctx.provide('llm', { stream() { throw new Error('Unexpected model call') } })
  ctx.provide('sessionProjections', { snapshot: () => ({ values: {} }) })
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode, workspaceRoot: '/workspace', sessionId: 'test' }) })
  ctx.provide('sandbox', { async confine(argv, policy) {
    wrapped.push({ argv, policy })
    if (deny) throw new Error('sandbox denied')
    return { argv: ['sandbox-runner', ...argv] }
  } })
  ctx.provide('subprocess', {
    async resolveExecutable(name) { return name },
    spawn(spec) {
      spawns.push(spec)
      const args = spec.argv
      let text = ''
      if (args.includes('--show-toplevel')) text = '/workspace\n'
      if (args.includes('symbolic-ref')) text = 'codex/test\n'
      return { done: Promise.resolve({ exitCode: 0, signal: null }), collected: {
        stdout: { readFrom: () => ({ text, lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) },
      } }
    },
  })
  const fiber = ctx.plugin(host); await fiber.await()
  return { ctx, fiber, spawns, wrapped, descriptors, service: ctx.get('dshgit') }
}
test('native Cordis host registers strict Typert run and confines every managed process', async () => {
  const b = await bench()
  try {
    assert.deepEqual(remoteMethods(b.service).map(m => m.method), ['run'])
    assert.equal(b.descriptors[0].descriptors[0].parameters[0].codec.mode, 'strict')
    const result = await b.service.run({ sessionId: 'test', action: 'state' })
    assert.equal(result.state.branch, 'codex/test')
    assert.equal(b.spawns.length, b.wrapped.length)
    assert.ok(b.spawns.every(spec => spec.argv[0] === 'sandbox-runner'))
    assert.ok(b.spawns.every(spec => spec.env.GIT_LITERAL_PATHSPECS === '1'))
  } finally { await b.fiber.dispose() }
})

test('real Typert gateway accepts the Client request field from the installable bundle in source mode', async () => {
  const b = await bench('workspace-write', false, await import('../lib/host.js'))
  const gatewayFiber = b.ctx.plugin(ctx => { new TypertGatewayService(ctx, {}) })
  await gatewayFiber.await()
  const gateway = b.ctx.get('typertGateway')
  const descriptor = b.descriptors[0].descriptors[0]
  // rc.1 requires the caller's connection lifetime on every direct invocation.
  // Production requests receive this from DSH's transport, not from wire args.
  const lifetime = new AbortController()
  const peer = { id: 'dshgit-test-peer', ctx: b.ctx, principal: { kind: 'owner' },
    interactions: 'none', signal: lifetime.signal, async dispose() { lifetime.abort() } }
  const invoke = request => gateway.invoke({
    peer,
    namespace: descriptor.namespace, method: descriptor.method,
    args: { [descriptor.parameters[0].wire]: request },
  })
  try {
    const result = await invoke({ sessionId: 'test', action: 'state' })
    assert.equal(result.state.branch, 'codex/test')
    assert.ok(b.spawns.length > 0)
    assert.equal(b.spawns.length, b.wrapped.length)
    const before = b.spawns.length
    await assert.rejects(invoke({ sessionId: 'test', action: 'invalid' }), /Invalid option/)
    assert.equal(b.spawns.length, before)
    await assert.rejects(gateway.invoke({
      peer,
      namespace: descriptor.namespace, method: descriptor.method,
      args: { raw: { sessionId: 'test', action: 'state' } },
    }), /unexpected "raw"/)
    assert.equal(b.spawns.length, before)
    await peer.dispose()
    await assert.rejects(invoke({ sessionId: 'test', action: 'state' }), /disposed/)
    assert.equal(b.spawns.length, before)
  } finally { await gatewayFiber.dispose(); await b.fiber.dispose() }
})
test('native host refuses a read-only mutation before spawning', async () => {
  const b = await bench('read-only')
  try {
    await assert.rejects(b.service.run({ sessionId: 'test', action: 'push' }), /只读/)
    assert.equal(b.spawns.length, 0)
  } finally { await b.fiber.dispose() }
})
test('confinement denial never falls back to an unconfined child', async () => {
  const b = await bench('workspace-write', true)
  try {
    await assert.rejects(b.service.run({ sessionId: 'test', action: 'state' }), /sandbox denied/)
    assert.equal(b.spawns.length, 0)
  } finally { await b.fiber.dispose() }
})
test('unloading the native plugin aborts its process signals', async () => {
  const b = await bench()
  await b.service.run({ sessionId: 'test', action: 'state' })
  await b.fiber.dispose()
  assert.ok(b.spawns.every(spec => spec.signal.aborted))
})
