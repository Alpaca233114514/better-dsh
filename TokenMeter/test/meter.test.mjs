import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../host.js', import.meta.url), 'utf8')
async function fixture({ initial, native = false, failWrite = false, failRead = false, holdWrite } = {}) {
  const files = new Map(initial ? [['C:/work/.dsh-token-meter.json', initial]] : [])
  const handlers = new Map(), events = new Map(), timers = [], writes = []
  const sessions = []
  const bridge = { handle: (key, fn) => handlers.set(key, fn), ...(native ? { storageRoot: 'C:/private' } : {}) }
  const plugin = vm.runInNewContext('(function(harness){' + source + '\n})', { console: { log() {}, error() {} } })(bridge)
  const services = {
    sessions: { list: () => sessions },
    sandboxPolicy: { workspaceRoot: native ? undefined : 'C:/work', resolve: () => ({ mode: 'workspace-write' }) },
    fs: {
      resolve: async (name, { cwd }) => cwd + '/' + name,
      stat: async path => { if (failRead) throw new Error('access denied'); return files.has(path) ? {} : undefined },
      readText: async path => files.get(path),
      writeText: async (path, text) => {
        writes.push({ path, text })
        if (holdWrite) await holdWrite(writes.length)
        if (failWrite) throw new Error('disk unavailable')
        files.set(path, text)
      },
    },
  }
  plugin.apply({ get: key => services[key],
    on: (key, fn, options) => events.set(key, { fn, options }),
    interval: fn => timers.push(fn), effect: fn => fn(),
    debounce: () => Object.assign(() => {}, { dispose() {} }),
  })
  const state = () => handlers.get('meter:state')()
  const usage = async (value, broken = false) => {
    const stream = events.get('llm/stream').fn({ sessionId: 'session' }, async function* () {
      yield { type: 'usage', usage: value }
      if (broken) throw new Error('provider disconnected')
    })
    for await (const chunk of stream) {}
  }
  return { handlers, events, timers, writes, files, sessions, state, usage }
}

test('native fixed store discovers legacy data when sessions arrive after plugin startup', async () => {
  const original = JSON.stringify({ totalInput: 100, totalOutput: 10 })
  const meter = await fixture({ native: true, initial: original })
  assert.equal((await meter.state()).cumulative.total, 0)
  meter.sessions.push({ id: 'session', header: { cwd: 'C:/work' } })
  await meter.events.get('agent/created').fn({ agent: { session: meter.sessions[0] } })
  await meter.usage({ inputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 3, outputTokens: 11, reasoningTokens: 8 })
  await meter.timers[0]()
  assert.equal((await meter.state()).cumulative.total, 136)
  assert.equal(meter.files.get('C:/work/.dsh-token-meter.json'), original)
  assert.equal(JSON.parse(meter.files.get('C:/private/.dsh-token-meter.json')).totalInput, 115)
})

test('all lifecycle and stream hooks observe global session scopes', async () => {
  const meter = await fixture()
  for (const event of meter.events.values()) assert.equal(event.options.global, true)
})

test('unavailable native storage does not interrupt model streaming', async () => {
  const meter = await fixture({ native: true, failRead: true })
  await meter.usage({ inputTokens: 3, outputTokens: 2 })
  const state = await meter.state()
  assert.equal(state.cumulative.total, 5)
  assert.match(state.persistenceError, /读取失败/)
})

test('reported usage survives an interrupted provider stream and multiple samples use the final total', async () => {
  const meter = await fixture()
  await assert.rejects(meter.usage({ inputTokens: 3, outputTokens: 2 }, true), /disconnected/)
  assert.equal((await meter.state()).cumulative.total, 5)
  const stream = meter.events.get('llm/stream').fn({}, async function* () {
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } }
  })
  for await (const chunk of stream) {}
  assert.equal((await meter.state()).cumulative.total, 19)
})

test('corrupt history remains unchanged and exposes a persistence error', async () => {
  const meter = await fixture({ initial: '{invalid json' })
  await meter.usage({ inputTokens: 1, outputTokens: 1 })
  await meter.timers[0]()
  assert.equal(meter.writes.length, 0)
  assert.match((await meter.state()).persistenceError, /历史数据/)
  assert.equal(meter.files.get('C:/work/.dsh-token-meter.json'), '{invalid json')
})

test('write failures remain visible and reset does not report persistence success', async () => {
  const meter = await fixture({ failWrite: true })
  await meter.usage({ inputTokens: 1, outputTokens: 1 })
  await meter.timers[0]()
  assert.match((await meter.state()).persistenceError, /保存失败/)
  await assert.rejects(meter.handlers.get('meter:reset')(), /保存失败/)
})

test('a pending save cannot overwrite usage recorded while it is in flight', async () => {
  let release, started
  const pending = new Promise(resolve => { started = resolve })
  const meter = await fixture({ holdWrite: async index => {
    if (index === 1) { started(); await new Promise(resolve => { release = resolve }) }
  } })
  await meter.usage({ inputTokens: 2, outputTokens: 3 })
  const first = meter.timers[0]()
  await pending
  await meter.usage({ inputTokens: 7, outputTokens: 11 })
  const second = meter.timers[0]()
  release()
  await Promise.all([first, second])
  assert.equal(JSON.parse(meter.files.get('C:/work/.dsh-token-meter.json')).totalOutput, 14)
  assert.equal(meter.writes.length, 2)
})
