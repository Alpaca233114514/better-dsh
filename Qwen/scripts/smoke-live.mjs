// Live smoke: load dsh-qwen through DSH's official profile resolution, then
//   1. assert the exact wire payload per thinking level (stubbed transport), and
//   2. stream one real request at `low` to prove reasoning reaches the harness.
//
// Run with Desktop's Electron, ELECTRON_RUN_AS_NODE=1 and --expose-internals:
//   $env:QWEN_API_KEY = ...; & "<Desktop>\DeepSeek Harness.exe" --expose-internals scripts/smoke-live.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const [runtimeArg, profileArg, liveFlag] = process.argv.slice(2)
if (!runtimeArg || !profileArg || liveFlag !== '--live') throw new Error('Explicit live test (uses model quota): pass <runtime> <profile> --live and set QWEN_API_KEY / QWEN_BASE_URL')
const runtime = resolve(runtimeArg)
const profileDir = resolve(profileArg)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const installAnchor = join(runtime, 'node_modules/@deepseek-ai/dsh/package.json')
const baseURL = process.env.QWEN_BASE_URL
if (!baseURL) throw new Error('QWEN_BASE_URL is required for the live endpoint')
const key = process.env.QWEN_API_KEY
if (!key) throw new Error('QWEN_API_KEY is required')

const official = name => pathToFileURL(join(runtime, 'node_modules/@deepseek-ai', name, 'lib/index.js')).href
const { loadProfileDirectory, createRuntimeResolution, PluginPackages } = await import(official('dsh-app-boot'))
const { Context } = await import(official('cordis'))

const profile = loadProfileDirectory('dsh', profileDir, installAnchor)
const resolution = await createRuntimeResolution({ installAnchor, profile, home: dirname(dirname(profileDir)) })
const ctx = new Context()
new PluginPackages(ctx, { resolution })

const plugin = await import(pathToFileURL(join(root, 'lib/index.js')).href)
let registration
plugin.apply({
  inject: (_services, callback) => callback({
    get: () => undefined,
    effect: callback => callback(),
    llm: {
      registerAdapter: (routes, adapter) => {
        registration = { routes, adapter }
        return () => {}
      },
    },
  }),
}, {
  enabled: true,
  route: 'qwen-flash',
  displayName: 'Qwen Flash',
  baseURL,
  apiKeyEnv: 'QWEN_API_KEY',
  models: [{ id: 'qwen3.8-flash' }],
  defaultReasoningEffort: 'high',
  thinkingBudgets: { minimal: 1024, low: 4096, medium: 16384, high: 32768 },
  headers: {},
})
assert.deepEqual(registration.routes, ['qwen-flash'])

const info = await registration.adapter.resolveModel('qwen-flash', 'qwen3.8-flash')
console.log('resolved:', JSON.stringify({
  context: info.context,
  input: info.inputModalities,
  efforts: info.reasoning.efforts.map(effort => effort.id),
}))
assert.equal(info.context.contextWindow, 1_000_000)
assert.deepEqual(info.reasoning.efforts.map(effort => effort.id), ['off', 'minimal', 'low', 'medium', 'high'])
assert.equal(info.reasoning.defaultEffort, 'high')

// Payload probe: fail the transport on purpose so each level's request body is
// captured without spending provider tokens.
const realFetch = globalThis.fetch
let captured
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('/chat/completions')) return realFetch(url, init)
  captured = JSON.parse(init.body)
  return new Response('data: {"id":"probe","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

const levels = {}
for (const effort of ['off', 'minimal', 'low', 'medium', 'high']) {
  captured = undefined
  for await (const _chunk of registration.adapter.stream({
    provider: 'qwen-flash',
    model: 'qwen3.8-flash',
    reasoningEffort: effort,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Say OK' }] }],
  })) { /* drain */ }
  levels[effort] = {
    enable_thinking: captured.enable_thinking,
    thinking_budget: captured.thinking_budget,
    reasoning_effort: captured.reasoning_effort,
  }
}
console.log('payload:', JSON.stringify(levels, null, 2))

assert.deepEqual(levels.off, { enable_thinking: false, thinking_budget: undefined, reasoning_effort: undefined })
assert.deepEqual(levels.minimal, { enable_thinking: true, thinking_budget: 1024, reasoning_effort: undefined })
assert.deepEqual(levels.low, { enable_thinking: true, thinking_budget: 4096, reasoning_effort: undefined })
assert.deepEqual(levels.medium, { enable_thinking: true, thinking_budget: 16384, reasoning_effort: undefined })
assert.deepEqual(levels.high, { enable_thinking: true, thinking_budget: 32768, reasoning_effort: undefined })

// One real stream at `low`: reasoning must arrive as harness reasoning chunks.
globalThis.fetch = realFetch
let reasoning = ''
let text = ''
for await (const chunk of registration.adapter.stream({
  provider: 'qwen-flash',
  model: 'qwen3.8-flash',
  reasoningEffort: 'low',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Say OK' }] }],
  signal: AbortSignal.timeout(60_000),
})) {
  if (chunk.type === 'reasoning-delta') reasoning += chunk.text
  if (chunk.type === 'text-delta') text += chunk.text
  if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
    throw new Error(`stream failed: ${JSON.stringify(chunk.reason)}`)
  }
}
console.log('live low:', JSON.stringify({ textChars: text.length, reasoningChars: reasoning.length }))
assert.ok(reasoning.length > 0, 'low must produce reasoning')
assert.ok(text.length > 0, 'low must produce an answer')
console.log('smoke: ok')
