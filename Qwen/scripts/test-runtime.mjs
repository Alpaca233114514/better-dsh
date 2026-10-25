// Run with the target Desktop Electron, ELECTRON_RUN_AS_NODE=1:
//   <electron> --expose-internals scripts/test-runtime.mjs <runtime> <profile>
// Uses real DSH + pi-ai modules; all HTTP is intercepted and cannot leave the process.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const [runtimeArg, profileArg] = process.argv.slice(2)
if (!runtimeArg || !profileArg) throw new Error('Pass DSH runtime directory and profile directory')
const runtime = resolve(runtimeArg), profileDir = resolve(profileArg)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const official = name => pathToFileURL(join(runtime, 'node_modules/@deepseek-ai', name, 'lib/index.js')).href
const { loadProfileDirectory, createRuntimeResolution, PluginPackages, evaluatePluginCompatibility, getDshRuntimeVersion } = await import(official('dsh-app-boot'))
const { Context, Service } = await import(official('cordis'))
const { default: LlmRuntime } = await import(official('dsh-llm'))
const anchor = join(runtime, 'node_modules/@deepseek-ai/dsh/package.json')
const profile = loadProfileDirectory('dsh', profileDir, anchor)
const resolution = await createRuntimeResolution({ installAnchor: anchor, profile, home: dirname(dirname(profileDir)) })
new PluginPackages(new Context(), { resolution })
const plugin = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.equal(evaluatePluginCompatibility(manifest, {}, getDshRuntimeVersion()), undefined)
let count = 0
async function check(label, fn) { await fn(); count++; console.log(`ok ${count} - ${label}`) }
let calls = [], responder
const realFetch = globalThis.fetch
// No passthrough, including unexpected URLs.
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers })
  return responder(url, init)
}
function sse(parts, usage = { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }) {
  const data = parts.map(part => `data: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, ...part }] })}\n\n`).join('')
    + `data: ${JSON.stringify({ id: 'fixture', choices: [], usage })}\n\ndata: [DONE]\n\n`
  // Split UTF-8 bytes to exercise actual incremental decoder/parser behavior.
  const bytes = new TextEncoder().encode(data)
  return new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 11) c.enqueue(bytes.slice(i, i + 11)); c.close() } }), { headers: { 'content-type': 'text/event-stream' } })
}
const textResponse = () => sse([
  { delta: { reasoning_content: '检查中' }, finish_reason: null },
  { delta: { content: '你好' }, finish_reason: null },
  { delta: {}, finish_reason: 'stop' },
])
function mount(overrides = {}, credential = 'fixture-only') {
  let adapter, routes, registrations = 0
  const config = plugin.Config({ ...overrides })
  plugin.apply({ inject: (_, callback) => callback({
    get: name => name === 'credentials' ? { resolve: async () => credential ? { value: credential } : undefined } : undefined,
    effect: fn => fn(),
    llm: { registerAdapter: (ids, value) => { routes = ids; adapter = value; registrations++; return () => {} } },
  }) }, config)
  return { adapter, config, routes, registrations }
}
const request = { provider: 'qwen-flash', model: 'qwen3.8-flash', messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }] }
async function drain(adapter, options = {}) {
  const result = []
  for await (const chunk of adapter.stream({ ...request, ...options })) result.push(chunk)
  return result
}
try {
  await check('schema defaults create a usable route; disabled registers nothing', async () => {
    const host = mount()
    assert.deepEqual(host.routes, ['qwen-flash'])
    assert.equal(mount({ enabled: false }).registrations, 0)
    assert.equal((await host.adapter.resolveModel(request.provider, request.model)).reasoning.defaultEffort, 'high')
  })
  await check('native Cordis loads the plugin with schema-parsed models and releases its route', async () => {
    const context = new Context()
    class FixtureCredentials extends Service {
      constructor(ctx) { super(ctx, 'credentials') }
      async resolve() { return { value: 'fixture-only' } }
    }
    await context.plugin(LlmRuntime)
    await context.plugin(FixtureCredentials)
    const fork = await context.plugin(plugin, { models: [{ id: 'qwen3.8-flash' }] })
    const info = await context.llm.resolveModelInfo('qwen-flash', 'qwen3.8-flash')
    assert.equal(info.context.contextWindow, 1000000)
    responder = textResponse
    const chunks = []
    for await (const chunk of context.llm.stream(request)) chunks.push(chunk)
    assert.equal(chunks.at(-1).reason.kind, 'stop')
    await fork.dispose()
    await assert.rejects(() => context.llm.resolveModelInfo('qwen-flash', 'qwen3.8-flash'))
  })
  await check('all thinking budgets reach real wire exclusively; successful text/reasoning finishes', async () => {
    const { adapter } = mount()
    responder = textResponse
    for (const [effort, budget] of Object.entries({ off: undefined, minimal: 1024, low: 4096, medium: 16384, high: 32768 })) {
      const chunks = await drain(adapter, { reasoningEffort: effort, maxTokens: 65536 })
      const body = calls.at(-1).body
      assert.equal(body.enable_thinking, effort !== 'off')
      assert.equal(body.thinking_budget, budget)
      assert.equal(body.reasoning_effort, undefined)
      assert.equal(body.max_tokens, 65536)
      assert.equal(body.max_completion_tokens, undefined)
      assert.equal(chunks.at(-1).reason.kind, 'stop')
      assert.equal(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''), '你好')
      assert.equal(chunks.filter(c => c.type === 'reasoning-delta').map(c => c.text).join(''), '检查中')
    }
  })
  await check('effort mode never emits thinking_budget', async () => {
    const { adapter } = mount({ thinkingMode: 'effort' })
    for (const effort of ['off', 'minimal', 'low', 'medium', 'high']) {
      await drain(adapter, { reasoningEffort: effort })
      const body = calls.at(-1).body
      assert.equal(body.thinking_budget, undefined)
      assert.equal(body.enable_thinking, effort !== 'off')
      if (effort !== 'off') assert.equal(body.reasoning_effort, effort)
    }
  })
  await check('gateway aliases retain wire ID and preset capacity', async () => {
    const { adapter } = mount({ models: [{ id: 'cmaas-qwen3.8-flash' }] })
    const info = await adapter.resolveModel(request.provider, 'cmaas-qwen3.8-flash')
    assert.equal(info.context.contextWindow, 1000000)
    await drain(adapter, { model: 'cmaas-qwen3.8-flash' })
    assert.equal(calls.at(-1).body.model, 'cmaas-qwen3.8-flash')
  })
  await check('non-thinking model works with high route default, including prepareCall', async () => {
    const { adapter } = mount({ models: [{ id: 'coder', thinking: false, maxTokens: 2048 }] })
    const prepared = await adapter.prepareCall(request.provider, 'coder')
    assert.equal(prepared.model.defaultMaxTokens, 2048)
    for await (const _ of prepared.stream({ ...request, model: 'coder' })) {}
    assert.equal(calls.at(-1).body.enable_thinking, undefined)
    await drain(adapter, { model: 'coder' })
  })
  await check('missing credential is authoritative and produces no network request', async () => {
    const { adapter } = mount({}, '')
    const previous = calls.length
    assert.deepEqual(await adapter.listModels(request.provider), [])
    await assert.rejects(() => drain(adapter), error => error.code === 'MISSING_CREDENTIAL')
    assert.equal(calls.length, previous)
  })
  await check('tool call fragments, replay and tool result survive the next turn', async () => {
    const { adapter } = mount()
    const tools = [{ name: 'lookup', description: 'lookup', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }]
    responder = () => sse([
      { delta: { reasoning_content: '需要查询' }, finish_reason: null },
      { delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":' } }] }, finish_reason: null },
      { delta: { tool_calls: [{ index: 0, function: { arguments: '"你好"}' } }] }, finish_reason: null },
      { delta: {}, finish_reason: 'tool_calls' },
    ])
    const first = await drain(adapter, { tools })
    assert.equal(first.at(-1).reason.kind, 'tool-calls')
    const content = first.filter(c => c.type === 'block-end').map(c => c.block)
    const call = content.find(b => b.type === 'tool-call')
    assert.equal(call.name, 'lookup')
    assert.deepEqual(JSON.parse(call.arguments), { q: '你好' })
    responder = textResponse
    const second = await drain(adapter, { tools, messages: [
      ...request.messages,
      { role: 'assistant', content, source: { kind: 'model', provider: request.provider, model: request.model, replayState: first.at(-1).replayState } },
      { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: '查询结果' }] },
    ] })
    assert.equal(second.at(-1).reason.kind, 'stop')
    assert.ok(calls.at(-1).body.messages.some(m => m.role === 'tool' && m.tool_call_id === call.id))
  })
  await check('401 is an error, not a successful empty response', async () => {
    responder = () => new Response('{"error":{"message":"unauthorized"}}', { status: 401 })
    const chunks = await drain(mount().adapter)
    assert.equal(chunks.at(-1).reason.kind, 'error')
    assert.equal(chunks.at(-1).reason.failure.code, 'AUTH')
  })
  await check('truncated stream cannot succeed', async () => {
    responder = () => sse([{ delta: { content: 'partial' }, finish_reason: null }])
    const chunks = await drain(mount().adapter)
    assert.equal(chunks.at(-1).reason.kind, 'error')
  })
  console.log(JSON.stringify({ runtime: getDshRuntimeVersion(), checks: count, network: 'intercepted-only', result: 'passed' }))
} finally { globalThis.fetch = realFetch }
