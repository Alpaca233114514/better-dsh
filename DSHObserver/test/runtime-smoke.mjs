// Desktop Electron with ELECTRON_RUN_AS_NODE=1; synthetic adapter only.
// Usage: <electron> --expose-internals runtime-smoke.mjs <dsh runtime> <isolated DSH_HOME>
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [runtime, home] = process.argv.slice(2).map(p => resolve(p))
if (!runtime || !home) throw new Error('Pass runtime and isolated home')
const anchor = pathToFileURL(join(runtime, 'runtime-check.mjs')).href
registerHooks({ resolve(specifier, context, next) {
  return next(specifier, specifier.startsWith('@deepseek-ai/') ? { ...context, parentURL: anchor } : context)
} })
const { Context } = await import('@deepseek-ai/cordis')
const { default: LlmRuntime, LlmAdapter, markAgentLoopRequest } = await import('@deepseek-ai/dsh-llm')
const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import('@deepseek-ai/dsh-app-boot')
const plugin = await import('../host.mjs')
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(evaluatePluginCompatibility(manifest, {}, getDshRuntimeVersion()), undefined)
process.env.DSH_HOME = home
const ctx = new Context(), logs = []
ctx.provide('sessions', {})
if (!ctx.logger) ctx.provide('logger', { info: x => logs.push(x), warn: x => logs.push(x) })
await ctx.plugin(LlmRuntime)
const observer = await ctx.plugin(plugin)
assert.equal(observer.state, 2, 'observer plugin must be active')
const chunks = [
  { type: 'text-delta', index: 0, text: 'PRIVATE FIXTURE OUTPUT' },
  { type: 'usage', usage: { inputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 10, outputTokens: 4 } },
  { type: 'finish', reason: { kind: 'stop' } },
]
class FixtureAdapter extends LlmAdapter {
  async resolveModel(provider, model) { return { provider, id: model, name: model, context: { contextWindow: 4096 } } }
  async *stream() { for (const chunk of chunks) { await new Promise(r => setTimeout(r, 5)); yield chunk } }
}
ctx.llm.registerAdapter(['observer-fixture'], new FixtureAdapter())
const session = { id: 'observer-test' }
ctx.emit('session/event', session, { type: 'step/start', time: Date.now(), seq: 0, data: { turn: 1, step: 1 } })
ctx.emit('session/event', session, { type: 'request/context', time: Date.now(), seq: 1, data: { provider: 'observer-fixture', model: 'fixture', contextWindow: 4096 } })
const request = markAgentLoopRequest({ sessionId: session.id, provider: 'observer-fixture', model: 'fixture',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'PRIVATE FIXTURE INPUT' }] }] })
Object.freeze(request)
const seen = []
for await (const chunk of ctx.llm.stream(request)) seen.push(chunk)
assert.deepEqual(seen, chunks)
await observer.dispose()
const folder = join(home, 'state/dsh-observer'), files = await readdir(folder)
const raw = (await Promise.all(files.map(f => readFile(join(folder, f), 'utf8')))).join('')
const rows = raw.trim().split('\n').map(JSON.parse), end = rows.find(r => r.kind === 'call-end')
assert.equal(end.contextTokens, 60)
assert.equal(end.contextWindow, 4096)
assert.equal(end.turn, 1)
assert.equal(end.purpose, 'conversation')
assert.equal(end.outputTokens, 4)
assert.ok(end.decodeTps > 0)
assert.ok(rows.some(r => r.kind === 'recorder-stop'))
assert.ok(!raw.includes('PRIVATE'))
await mkdir(home, { recursive: true })
await writeFile(join(home, 'receipt.json'), JSON.stringify({ ok: true, runtime: getDshRuntimeVersion(), compatibility: 'passed',
  streamPassthrough: true, contextTokens: end.contextTokens, decodeTps: end.decodeTps, privacy: 'no fixture content persisted', records: rows.length,
  scope: 'real desktop Cordis and LlmRuntime with synthetic adapter; no network or model calls' }, null, 2))
console.log('PASS desktop runtime, stream passthrough, session correlation, usage, persistence, disposal, privacy')
await ctx.fiber.dispose()
