import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

const read = (file) => readFileSync(fileURLToPath(new URL('../' + file, import.meta.url)), 'utf8')
const managerCode = read('BetterManager/host.js')
const meterCode = read('TokenMeter/host.js')
const tick = () => new Promise((r) => setImmediate(r))

async function evaluate(code, services, globals = {}) {
  const handlers = new Map(), events = new Map(), intervals = [], cleanup = []
  const plugin = await vm.runInNewContext('(async () => {\n' + code + '\n})()', {
    console: { log() {}, error() {} },
    harness: { handle: (name, fn) => handlers.set(name, fn) },
    ...globals,
  })
  const ctx = {
    get: (name) => services[name],
    effect: (fn) => { const dispose = fn(); if (dispose) cleanup.push(dispose) },
    interval: (fn) => { intervals.push(fn); return () => {} },
    debounce: (fn) => Object.assign(() => {}, { dispose() {}, flush: fn }),
    on: (name, fn) => { events.set(name, fn); return () => {} },
  }
  plugin.apply(ctx)
  return { handlers, events, intervals, cleanup }
}

async function manager(store, options = {}) {
  const session = { id: 'owner', header: { cwd: 'D:/owner-project' } }
  const agent = { id: session.id, session }
  const rows = [{ pluginId: 'other-1', agentId: 'other', packages: [] }, {
    pluginId: 'plcntr-81', agentId: 'owner', packages: [{ packageId: 'pkg-1', name: 'Better Manager', purpose: 'manage', hasHostHalf: true, hasClientHalf: false }],
    nextPackageId: 'pkg-1', latestRun: { status: 'starting-host' },
  }]
  const sources = new Map([['plcntr-81/pkg-1', { host: managerCode }]])
  if (options.collision) {
    rows.push({ pluginId: 'tkmtr-2', agentId: 'owner', packages: [{ packageId: 'pkg-2', name: 'Unrelated', purpose: 'other', hasHostHalf: true, hasClientHalf: false }] })
    sources.set('tkmtr-2/pkg-2', { host: 'return { apply() { /* unrelated */ } }' })
  }
  let saved = store === undefined ? null : typeof store === 'string' ? store : JSON.stringify(store)
  const writes = [], defines = []
  let count = 100
  const runner = {
    inventory: () => rows,
    inspectPackage: (owner, id, packageId) => {
      assert.equal(owner.id, 'owner')
      const pkg = rows.find((r) => r.pluginId === id).packages.find((p) => p.packageId === packageId)
      return { ...pkg, code: sources.get(id + '/' + packageId) }
    },
    define: (request) => {
      defines.push(request)
      if (options.failCode && options.failCode === request.code.host) throw new Error('invalid source')
      const pluginId = request.plugin.kind === 'new' ? request.plugin.idPrefix + '-' + (++count) : request.plugin.pluginId
      let row = rows.find((r) => r.pluginId === pluginId)
      if (!row) { row = { pluginId, agentId: request.sessionId, packages: [] }; rows.push(row) }
      const pkg = { packageId: 'pkg-' + (++count), name: request.name, purpose: request.purpose,
        hasHostHalf: !!request.code.host, hasClientHalf: !!request.code.client }
      row.packages.push(pkg)
      sources.set(pluginId + '/' + pkg.packageId, request.code)
      return { ...pkg, pluginId }
    },
  }
  Object.defineProperty(runner, 'registry', { get() { throw new Error('private registry must not be used') } })
  const fs = {
    resolve: async (name, { cwd }) => ({ displayPath: cwd + '/' + name }),
    stat: async (target) => target.displayPath.endsWith('plugins.json') && saved !== null ? {} : undefined,
    readText: async () => saved,
    writeText: async (target, text, _expected, _signal, policy) => {
      if (policy.mode === 'read-only') throw new Error('FS_POLICY_DENIED')
      writes.push({ target, text, policy })
      if (target.displayPath.endsWith('plugins.json')) saved = text
    },
  }
  const runtime = await evaluate(managerCode, {
    fs, dynamicCordisRunner: runner,
    agents: { get: (id) => id === 'owner' ? agent : undefined },
    sessions: { get: (id) => id === 'owner' ? session : undefined },
    sandboxPolicy: { resolve: () => ({ mode: options.readOnly ? 'read-only' : 'workspace-write', workspaceRoot: session.header.cwd }) },
  })
  await tick()
  return { ...runtime, rows, sources, writes, defines, options, get saved() { return saved } }
}

const snapshot = (plugins) => ({ version: 1, root: 'D:/owner-project', savedAt: 1, plugins })
const oldPlugin = (overrides = {}) => ({ pluginId: 'tkmtr-2', name: 'Meter', purpose: 'measure', enabled: true, currentPackageId: 'old-1', packages: [
  { packageId: 'old-1', name: 'Meter', purpose: 'measure', hasHostHalf: true, host: 'return { apply() {} }', client: null },
  { packageId: 'old-2', name: 'Meter new', purpose: 'measure new', hasClientHalf: true, host: null, client: 'return { apply() {} }' },
], ...overrides })

test('BetterManager resolves arbitrary manager identity and writes only to its owning workspace', async () => {
  const m = await manager()
  const diag = await m.handlers.get('bm:diag')()
  assert.equal(diag.root, 'D:/owner-project')
  assert.equal(diag.rootSource, 'self-session')
  assert.equal(m.writes.filter((w) => w.target.displayPath.endsWith('plugins.json')).length, 1)
})

test('v1 snapshots restore through public define, remap IDs, preserve versions and selected package', async () => {
  const m = await manager(snapshot([oldPlugin(), { pluginId: 'plcntr-3', packages: [{ host: managerCode }] }]))
  const meta = await m.handlers.get('bm:list')()
  assert.equal(meta.autoRestored, true, JSON.stringify(meta))
  assert.equal(meta.runPlan.length, 1)
  assert.notEqual(meta.runPlan[0].pluginId, 'tkmtr-2')
  assert.equal(meta.runPlan[0].packageId, m.rows.at(-1).packages[0].packageId)
  assert.equal(m.defines[0].plugin.kind, 'new')
  assert.equal(m.defines[1].plugin.kind, 'existing')
  assert.equal(m.rows.length, 3)
  const saved = JSON.parse(m.saved)
  const meter = saved.plugins.find((p) => p.sourcePluginId === 'tkmtr-2')
  assert.equal(saved.version, 2)
  assert.equal(meter.enabled, true)
  assert.equal(meter.packages.length, 2)
  const again = await m.handlers.get('bm:restore')()
  assert.equal(again.restored, 0)
  assert.equal(m.defines.length, 2)
})

test('incomplete snapshot source reports failure and is never overwritten by a heartbeat', async () => {
  const original = snapshot([oldPlugin({ packages: [{ packageId: 'lost', hasHostHalf: true, host: null }] })])
  const m = await manager(original)
  for (const heartbeat of m.intervals) heartbeat()
  const result = await m.handlers.get('bm:save')({ force: true })
  assert.equal(result.ok, false)
  assert.match(result.error, /缺少完整源码/)
  assert.equal(m.saved, JSON.stringify(original))
  assert.equal(m.defines.length, 0)
})

test('reused IDs retain both unrelated plugins across the next snapshot restore', async () => {
  const first = await manager(snapshot([oldPlugin()]), { collision: true })
  const saved = JSON.parse(first.saved)
  saved.plugins = saved.plugins.filter((p) => p.pluginId.startsWith('tkmtr-'))
  assert.equal(saved.plugins.length, 2)
  const second = await manager(saved)
  const restored = second.rows.filter((r) => r.pluginId.startsWith('tkmtr-'))
  assert.equal(restored.length, 2)
  assert.deepEqual(restored.map((r) => r.packages.length).sort(), [1, 2])
})

test('partial restore retries the failed version without duplicating earlier packages', async () => {
  const p = oldPlugin()
  p.packages[1].host = 'invalid body'
  const m = await manager(snapshot([p]), { failCode: 'invalid body' })
  assert.equal(m.rows.at(-1).packages.length, 1)
  m.options.failCode = null
  const result = await m.handlers.get('bm:restore')()
  assert.equal(result.ok, true)
  assert.equal(m.rows.length, 3)
  assert.equal(m.rows.at(-1).packages.length, 2)
})

test('corrupt snapshots and read-only Session policy retain their original data', async () => {
  const corrupt = await manager('{broken json')
  assert.equal((await corrupt.handlers.get('bm:save')({ force: true })).ok, false)
  assert.equal(corrupt.saved, '{broken json')
  const original = snapshot([])
  const readOnly = await manager(original, { readOnly: true })
  assert.equal((await readOnly.handlers.get('bm:save')({ force: true })).ok, false)
  assert.equal(readOnly.saved, JSON.stringify(original))
})

async function meter(existing = {}, options = {}) {
  const writes = []
  const s = { id: 'meter-session', header: { cwd: 'C:/work' } }
  const runtime = await evaluate(meterCode, {
    sessions: { list: () => [s] },
    sandboxPolicy: { workspaceRoot: 'C:/work', resolve: () => ({ mode: options.readOnly ? 'read-only' : 'workspace-write', workspaceRoot: 'C:/work' }) },
    fs: { resolve: async (name, { cwd }) => ({ displayPath: cwd + '/' + name }), stat: async () => ({}),
      readText: async () => { await tick(); return JSON.stringify(existing) },
      writeText: async (_target, content, _expected, _signal, policy) => { writes.push({ content: JSON.parse(content), policy }) },
    },
  })
  return { ...runtime, writes, s }
}

async function usage(m, value) {
  const chunks = [{ type: 'usage', usage: value }, { type: 'finish', reason: { kind: 'stop' } }]
  const stream = m.events.get('llm/stream')({ sessionId: m.s.id }, async function* () { yield* chunks })
  const forwarded = []
  for await (const chunk of stream) forwarded.push(chunk)
  assert.deepEqual(forwarded, chunks)
}

test('TokenMeter includes disjoint cache writes, retains history and counts reasoning output only once', async () => {
  const m = await meter({ totalInput: 100, totalCacheRead: 40, totalOutput: 10 })
  m.events.get('agent/inbox/claimed')({ agent: { id: m.s.id }, turn: 1 })
  await usage(m, { inputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 3, outputTokens: 11, reasoningTokens: 8, totalTokens: 26 })
  m.events.get('agent/turn-stopping')({ agent: { id: m.s.id }, turn: 1 })
  const state = await m.handlers.get('meter:state')()
  assert.equal(state.cumulative.input, 115)
  assert.equal(state.cumulative.output, 21)
  assert.equal(state.cumulative.cacheRead, 47)
  assert.equal(state.cumulative.cacheWrite, 3)
  assert.equal(state.peakRoundTokens, 26)
  assert.equal(state.cumulative.total, 136)
  m.intervals[0]()
  await tick()
  assert.equal(m.writes.at(-1).content.totalCacheWrite, 3)
})

test('meter persistence respects read-only policy and legacy cacheWrite defaults', async () => {
  const m = await meter({ totalInput: 12 }, { readOnly: true })
  assert.equal((await m.handlers.get('meter:state')()).cumulative.cacheWrite, 0)
  await usage(m, { inputTokens: 1, outputTokens: 1 })
  m.intervals[0]()
  await tick()
  assert.equal(m.writes[0].policy.mode, 'read-only')
})

test('all dynamic halves parse as the async bodies accepted by DSH', () => {
  for (const file of ['BetterManager/host.js', 'BetterManager/client.js', 'TokenMeter/host.js', 'TokenMeter/client.js']) {
    assert.doesNotThrow(() => new vm.Script('(async () => {\n' + read(file) + '\n})()'))
  }
})

async function client(options = {}) {
  const subscriptions = new Set(), active = new Map(), failures = new Map(), calls = [], slots = new Map()
  const states = []
  let cursor = 0
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (initial) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (v) => { states[index] = v }] },
    useRef: (initial) => { const index = cursor++; return states[index] ??= { current: initial } },
    useCallback: (fn) => fn, useEffect() {},
    useSyncExternalStore: (_subscribe, get) => get(),
  }
  const runner = {
    activeRuns: { getSnapshot: () => active, subscribe: (fn) => { subscriptions.add(fn); return () => subscriptions.delete(fn) } },
    lastRunError: { getSnapshot: () => failures, subscribe: () => () => {} },
    reconcileApprovals() {}, startUserRun: async (request) => calls.push(request),
    approve: async (...args) => calls.push({ approve: args }), decline: async (...args) => calls.push({ decline: args }),
  }
  const rows = options.rows || [{ pluginId: 'tkmtr-8', agentId: 'owner', packages: [{ packageId: 'pkg-9', name: 'Meter', hasClientHalf: true }] }]
  await evaluate(read('BetterManager/client.js'), {
    slots: {
      inject: (_slot, fn) => fn(),
      register: (meta, component) => { slots.set(meta.id, component); return () => slots.delete(meta.id) },
    },
    dynamicCordisRunner: runner,
    'remote.dynamicCordisRunner': { inventory: async () => ({ ok: true, value: rows }) },
  }, { React, styles: { insert() {} }, host: { call: async (name) => name === 'bm:list' ? {
    ok: true, ownerId: 'owner', autoRestored: true, runPlan: [{ pluginId: 'tkmtr-8', packageId: 'pkg-9' }],
  } : {} } })
  const page = slots.get('better-manager')({ close() {} })
  const render = () => { cursor = 0; return page.type(page.props) }
  function button(node, label) {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'button' && node.props.children.includes(label)) return node
    for (const child of node.props?.children.flat(Infinity) || []) {
      const found = button(child, label)
      if (found) return found
    }
    return null
  }
  button(render(), '刷新').props.onClick()
  await tick()
  return { slots, subscriptions, active, failures, calls, render, button }
}

test('Client preserves native approval access and never automatically runs restored source', async () => {
  const c = await client()
  assert.equal(c.calls.length, 0)
  assert.equal(c.slots.has('cordis-panel'), true) // null shadow, normal hidden state
  c.active.set('new-plugin', { phase: 'awaiting-approval' })
  for (const fn of c.subscriptions) fn()
  assert.equal(c.slots.has('cordis-panel'), false) // disposer reveals original slot
  c.active.clear()
  for (const fn of c.subscriptions) fn()
  assert.equal(c.slots.has('cordis-panel'), true)
})

test('Client approval authorizes only the displayed version and surfaces fulfilled run failures', async () => {
  const c = await client({ rows: [{ pluginId: 'tkmtr-8', agentId: 'owner', packages: [{ packageId: 'pkg-9', name: 'Meter' }],
    latestRun: { status: 'awaiting-approval', approvalRequestId: 'approval-4' } }] })
  c.button(c.render(), '批准此版本').props.onClick()
  await tick()
  assert.deepEqual(c.calls[0].approve, ['approval-4', false])
  c.failures.set('tkmtr-8', { message: 'host-half-failed: missing provider' })
  assert.match(JSON.stringify(c.render()), /host-half-failed: missing provider/)
})
