const { registerHooks } = require('node:module')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const root = process.argv[2].replaceAll('\\', '/') + '/'
const output = process.argv[3] + '/result.json'
registerHooks({ resolve(specifier, context, next) {
  if (!specifier.startsWith('@deepseek-ai/')) return next(specifier, context)
  const bits = specifier.split('/'), name = bits.slice(0, 2).join('/'), subpath = bits.length > 2 ? './' + bits.slice(2).join('/') : '.'
  const dir = root + name, pkg = JSON.parse(fs.readFileSync(dir + '/package.json'))
  let entry = pkg.exports?.[subpath] ?? (subpath === '.' ? pkg.exports ?? pkg.main : subpath)
  while (entry && typeof entry === 'object') entry = entry.import ?? entry.default ?? entry.node
  return { url: pathToFileURL(dir + '/'+ entry).href, shortCircuit: true }
} })
fs.mkdirSync(process.argv[3], { recursive: true });
;(async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const plugin = await import(pathToFileURL(require('node:path').resolve(__dirname, '../lib/host.js')))
  const ctx = new Context(), descriptors = [], events = new Map(), timers = []
  const original = { stat: async () => undefined, resolve: async () => ({}), readText: async () => '' }
  const session = { id: 'meter-smoke', header: { cwd: 'C:/synthetic-meter-workspace' } }
  ctx.provide('fs', original)
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'read-only' }) })
  ctx.provide('sessions', { list: () => [session] })
  ctx.provide('typert', { remotes: { register: value => descriptors.push(value) } })
  // Keep real Context/Service/Remote registration while making timers deterministic.
  ctx.interval = fn => { timers.push(fn); return () => {} }
  ctx.debounce = fn => Object.assign(() => {}, { dispose() {} })
  const actualOn = ctx.on.bind(ctx)
  ctx.on = (name, fn, options) => { events.set(name, { fn, options }); return actualOn(name, fn, options) }
  process.env.DSH_HOME = process.argv[3]
  plugin.apply(ctx)
  const initial = await ctx.tokenMeterDashboard.state()
  await events.get('agent/inbox/claimed').fn({ agent: { id: session.id }, turn: 1 })
  const chunks = [{ type: 'usage', usage: { inputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 3, outputTokens: 11 } }]
  const stream = events.get('llm/stream').fn({ sessionId: session.id }, async function* () { yield* chunks })
  for await (const chunk of stream) {}
  await events.get('agent/turn-stopping').fn({ agent: { id: session.id }, turn: 1 })
  for (const timer of timers) await timer()
  await new Promise(resolve => setTimeout(resolve, 100))
  const state = await ctx.tokenMeterDashboard.state()
  if (state.cumulative.total !== initial.cumulative.total + 26) throw new Error('token total mismatch')
  if (state.peakRoundTokens !== 26) throw new Error('round peak mismatch')
  if (!descriptors[0].descriptors.every(d => d.result.create().safeParse(state).success)) throw new Error('wire schema mismatch')
  if (![...events.values()].every(event => event.options.global)) throw new Error('event scope mismatch')
  const saved = JSON.parse(fs.readFileSync(process.env.DSH_HOME + '/state/token-meter-dashboard/.dsh-token-meter.json'))
  fs.writeFileSync(output, JSON.stringify({ ok: true, runtime: JSON.parse(fs.readFileSync(root + '@deepseek-ai/dsh/package.json')).version, totalDelta: 26, peak: state.peakRoundTokens, savedInput: saved.totalInput, descriptors: descriptors[0].descriptors.length }, null, 2))
})().catch(error => { fs.writeFileSync(output, JSON.stringify({ ok: false, error: error.stack }, null, 2)); process.exitCode = 1 })
