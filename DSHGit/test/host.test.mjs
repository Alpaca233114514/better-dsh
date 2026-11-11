import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { build } from 'esbuild'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
await mkdir('.test-build', { recursive: true })
await build({ entryPoints: ['src/host.ts'], outfile: '.test-build/host.mjs', bundle: true, platform: 'node', format: 'esm', target: 'es2022', external: ['@deepseek-ai/*', 'zod'] })
const plugin = await import('../.test-build/host.mjs')
async function bench(mode = 'workspace-write', deny = false, host = plugin, warm = false) {
  const root = (await mkdtemp('../.cache/dshgit-host-')).replaceAll('\\', '/')
  const { resolve } = await import('node:path')
  const workspace = resolve(root).replaceAll('\\', '/')
  await mkdir(workspace + '/.git')
  const ctx = new Context(), spawns = [], wrapped = [], descriptors = []
  ctx.provide('typert', {
    remotes: { register: contribution => descriptors.push(contribution) },
    // Source-mode Host definitions are discovered from @Remote method signatures.
    // Registering a Client contribution does not populate the Host local registry.
    local: { get: () => undefined, hasSeen: () => false },
    lookups: { definitions: () => [] },
  })
  ctx.provide('sessions', { list: () => warm ? ['test', 'second'].map(id => ({ id, header: { cwd: workspace } })) : [], get: id => ({ id, header: { cwd: workspace } }) })
  ctx.provide('llm', { stream() { throw new Error('Unexpected model call') } })
  ctx.provide('sessionProjections', { snapshot: () => ({ values: {} }) })
  ctx.provide('sandboxPolicy', { resolve: ({ session }) => ({ mode, workspaceRoot: workspace, sessionId: session.id }) })
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
      if (args.includes('--show-toplevel')) text = args.includes('--git-common-dir') ? workspace + '\n' + workspace + '/.git\n' + workspace + '/.git\n' : workspace + '\n'
      if (args.includes('symbolic-ref')) text = 'codex/test\n'
      if (args.includes('get-url')) text = 'https://github.com/example/repo.git\n'
      if (args.includes('powershell.exe')) text = 'http://127.0.0.1:8123\n'
      if (args.includes('graphql')) text = JSON.stringify({ data: { repository: { defaultBranchRef: { name: 'main' }, pullRequests: { nodes: [] } } } })
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
    assert.deepEqual(remoteMethods(b.service).map(m => m.method).sort(), ['changes', 'run'])
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
    const streamAbort = new AbortController()
    const stream = await gateway.stream({ peer, namespace: 'dshgit', method: 'changes', args: { sessionId: 'test' }, signal: streamAbort.signal })
    const iterator = stream[Symbol.asyncIterator]()
    assert.deepEqual((await iterator.next()).value, { changed: true })
    const waiting = iterator.next()
    const cancelled = assert.rejects(waiting, /aborted/)
    streamAbort.abort()
    await cancelled
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
test('PR read selects a proxy for one confined API call and leaves local Git alone', async t => {
  const proxy = 'http://127.0.0.1:8123'
  const keys = ['DSH_GIT_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY']
  const previous = keys.map(key => process.env[key])
  t.after(() => keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key]
    else process.env[key] = previous[i]
  }))
  for (const system of process.platform === 'win32' ? [false, true] : [false]) {
    if (system) keys.forEach(key => delete process.env[key])
    else process.env.DSH_GIT_PROXY = proxy
    const b = await bench()
    try {
      const result = await b.service.run({ sessionId: 'test', action: 'prInfo' })
      assert.deepEqual(result, { base: 'main', pr: null })
      const api = b.spawns.filter(spec => spec.argv.includes('gh'))
      assert.equal(api.length, 1)
      assert.equal(api[0].env.HTTPS_PROXY, proxy)
      assert.ok(b.spawns.filter(spec => spec.argv.includes('git')).every(spec => !spec.env.HTTPS_PROXY))
      assert.equal(b.spawns.filter(spec => spec.argv.includes('powershell.exe')).length, Number(system))
      assert.ok(b.spawns.every(spec => spec.argv[0] === 'sandbox-runner'))
    } finally { await b.fiber.dispose() }
  }
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

test('cached state reads spawn no additional processes and concurrent readers share initialization', async () => {
  const b = await bench()
  try {
    const states = await Promise.all(Array.from({ length: 20 }, () => b.service.run({ sessionId: 'test', action: 'state' })))
    assert.ok(states.every(result => result.state.branch === 'codex/test'))
    const before = b.spawns.length
    assert.equal(b.spawns.filter(spec => spec.argv.includes('--show-toplevel')).length, 1)
    for (let i = 0; i < 30; i++) await b.service.run({ sessionId: 'test', action: 'state' })
    assert.equal(b.spawns.length, before)
    await b.service.run({ sessionId: 'test', action: 'state', refresh: true })
    assert.ok(b.spawns.length > before)
  } finally { await b.fiber.dispose() }
})

test('requested sessions with the same workspace and confinement share one snapshot', async () => {
  const b = await bench('workspace-write', false, plugin, true)
  try {
    await Promise.all(['test', 'second'].map(sessionId => b.service.run({ sessionId, action: 'state' })))
    assert.equal(b.spawns.filter(spec => spec.argv.includes('--show-toplevel')).length, 1)
    assert.equal(b.spawns.filter(spec => spec.argv.includes('status')).length, 1)
  } finally { await b.fiber.dispose() }
})

test('idle cache expiration closes watches, clears data and rebuilds on demand', async () => {
  const b = await bench()
  try {
    await b.service.run({ sessionId: 'test', action: 'state' })
    const cache = (await [...b.service.caches.values()][0].cache)
    const before = b.spawns.length
    b.service.sweepCaches(Date.now() + 11 * 60_000)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(b.service.caches.size, 0)
    assert.equal(b.service.sessionKeys.size, 0)
    assert.equal(b.service.watches.entries.size, 0)
    assert.equal(cache.snapshot, undefined)
    assert.equal(cache.tracked.size, 0)
    assert.equal(b.spawns.length, before, 'eviction must not query Git')
    await b.service.run({ sessionId: 'test', action: 'state' })
    assert.equal(b.spawns.filter(spec => spec.argv.includes('--show-toplevel')).length, 2)
  } finally { await b.fiber.dispose() }
})

test('active subscriptions survive expiry; idle capacity evicts least recently used records', async () => {
  const b = await bench()
  const controller = new AbortController()
  try {
    const stream = b.service.changes('test', controller.signal)[Symbol.asyncIterator]()
    await stream.next()
    b.service.sweepCaches(Date.now() + 60 * 60_000)
    assert.equal(b.service.caches.size, 1)
    const waiting = stream.next(); controller.abort(); await waiting
    b.service.sweepCaches()
    assert.equal(b.service.caches.size, 1, 'idle TTL starts after subscription closes')
    const now = Date.now(), evicted = []
    for (let i = 0; i < 20; i++) {
      const abort = new AbortController()
      abort.signal.addEventListener('abort', () => evicted.push(i))
      b.service.caches.set('idle-' + i, { value: { idle: true }, abort, sessions: new Set(), lastUsed: now - 1000 + i })
    }
    b.service.sweepCaches(now)
    assert.equal(b.service.caches.size, 16)
    assert.deepEqual(evicted, [0, 1, 2, 3, 4])
  } finally { controller.abort(); await b.fiber.dispose() }
})

test('cache hits renew idle expiry without sweeping, sorting or spawning Git', async () => {
  const b = await bench()
  try {
    await b.service.run({ sessionId: 'test', action: 'state' })
    const record = [...b.service.caches.values()][0]
    record.lastUsed = Date.now() - 9 * 60_000
    const before = b.spawns.length
    const sweep = b.service.sweepCaches.bind(b.service)
    let sweeps = 0
    b.service.sweepCaches = (...args) => { sweeps++; return sweep(...args) }
    for (let i = 0; i < 50; i++) await b.service.run({ sessionId: 'test', action: 'state' })
    assert.equal(sweeps, 0)
    assert.equal(b.spawns.length, before)
    assert.ok(Date.now() - record.lastUsed < 1000)
    sweep(record.lastUsed + 2 * 60_000)
    assert.equal(b.service.caches.size, 1)
    sweep(record.lastUsed + 11 * 60_000)
    assert.equal(b.service.caches.size, 0)
  } finally { await b.fiber.dispose() }
})

for (const [label, host] of [['source', plugin], ['bundle', await import('../lib/host.js')]]) {
  test(`${label} host never scans on startup, session creation or sandbox-mode changes`, async () => {
    const b = await bench('workspace-write', false, host, true)
    try {
      await new Promise(resolve => setImmediate(resolve))
      const session = b.ctx.sessions.get('test')
      b.ctx.emit('session/created', session)
      b.ctx.emit('session/event', session, { type: 'sandbox/mode' })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(b.spawns.length, 0)
      assert.equal(b.service.caches.size, 0)
      const streamAbort = new AbortController()
      const stream = b.service.changes('test', streamAbort.signal)[Symbol.asyncIterator]()
      assert.deepEqual((await stream.next()).value, { changed: true })
      await stream.return()
      streamAbort.abort()
      assert.equal(b.spawns.filter(spec => spec.argv.includes('status')).length, 1)
      assert.ok(b.spawns.every(spec => spec.argv.includes('core.fsmonitor=')))
      b.ctx.emit('session/event', session, { type: 'sandbox/mode' })
      const before = b.spawns.length
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(b.spawns.length, before)
      assert.equal(b.service.caches.size, 0)
      assert.equal((await b.service.run({ sessionId: 'test', action: 'state' })).state.branch, 'codex/test')
    } finally { await b.fiber.dispose() }
  })
}

test('all remote Git commands retain configured proxy after safe global options', async t => {
  const previous = process.env.DSH_GIT_PROXY
  process.env.DSH_GIT_PROXY = 'http://127.0.0.1:8123'
  t.after(() => { if (previous === undefined) delete process.env.DSH_GIT_PROXY; else process.env.DSH_GIT_PROXY = previous })
  const b = await bench()
  try {
    const { gitArguments } = await import('../src/git.ts')
    const runner = b.service.runner('test')
    for (const command of ['ls-remote', 'fetch', 'push']) {
      await runner('git', gitArguments([command, 'origin']), b.ctx.sessions.get('test').header.cwd)
      assert.equal(b.spawns.at(-1).env.HTTPS_PROXY, process.env.DSH_GIT_PROXY)
      assert.ok(b.spawns.at(-1).argv.includes('core.fsmonitor='))
    }
    await runner('git', gitArguments(['status', '--', 'push']), b.ctx.sessions.get('test').header.cwd)
    assert.equal(b.spawns.at(-1).env.HTTPS_PROXY, undefined)
    assert.ok(b.spawns.every(spec => spec.argv[0] === 'sandbox-runner'))
  } finally { await b.fiber.dispose() }
})
