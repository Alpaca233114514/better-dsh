import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { Readable } from 'node:stream'
import { mkdtempSync, existsSync, writeFileSync, readFileSync, statSync, chmodSync, symlinkSync, unlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDiagnostics } from '../lib/diagnostics.js'
import * as plugin from '../index.js'
import { createPredictor } from '../lib/prediction.js'
import { createPredictionCache } from '../lib/cache.js'
import { contextOf, sanitize, usablePrediction } from '../lib/prompt.js'
import { normalizeEdit, resolveConfig } from '../lib/settings.js'
import { TYPERT } from '../lib/typert.host.js'

const message = (role, text) => ({ role, source: { kind: role === 'user' ? 'user' : 'model' }, content: [{ type: 'text', text }] })
function fixture() {
  const events = [{ type: 'turn/end', seq: 5, data: { reason: { kind: 'completed' } } }]
  const messages = [message('user', '检查测试'), message('assistant', '已经完成测试检查')]
  const route = { provider: 'test', model: 'model' }
  const session = { id: 's1', snapshotEvents: () => events, deriveMessages: () => messages, requestHeader: () => ({ config: route }) }
  const calls = []
  const llm = {
    resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high' }] } }),
    async *stream(options) {
      calls.push(options)
      yield { type: 'text-delta', index: 0, text: '添加并发场景测试' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const cache = createPredictionCache()
  const predictor = createPredictor({ ctx: { get: name => name === 'llm' ? llm : undefined }, debug() {}, cache, readConfig: resolveConfig })
  return { events, messages, route, session, calls, llm, cache, predictor }
}

test('only a completed turn can predict, even with force', async () => {
  for (const kind of ['running', 'cancelled', 'error', 'no-turn']) {
    const f = fixture()
    if (kind === 'running') f.events.push({ type: 'turn/start', seq: 6 })
    else if (kind === 'no-turn') f.events.length = 0
    else f.events[0].data.reason.kind = kind
    assert.equal(await f.predictor.predict(f.session, true), '', kind)
    assert.equal(f.calls.length, 0)
  }
  for (const last of [
    { role: 'assistant', content: [{ type: 'tool-call', name: 'read' }] },
    { role: 'assistant', content: [{ type: 'text', text: '正在检查' }, { type: 'tool-call', name: 'read' }] },
    { role: 'user', content: [{ type: 'image' }] },
  ]) {
    const f = fixture()
    f.messages.push(last)
    assert.equal(await f.predictor.predict(f.session, true), '')
    assert.equal(f.calls.length, 0)
  }
})

test('concurrent requests coalesce; route and completed turn define the cache', async () => {
  const f = fixture()
  assert.deepEqual(await Promise.all([f.predictor.predict(f.session), f.predictor.predict(f.session, true)]), ['添加并发场景测试', '添加并发场景测试'])
  assert.equal(f.calls.length, 1)
  await f.predictor.predict(f.session)
  assert.equal(f.calls.length, 1)
  f.route.model = 'other'
  await f.predictor.predict(f.session)
  assert.equal(f.calls.length, 2)
  f.events.push({ type: 'turn/end', seq: 10, data: { reason: { kind: 'completed' } } })
  await f.predictor.predict(f.session)
  assert.equal(f.calls.length, 3)
})

test('a model result arriving after the next user message is discarded', async () => {
  const f = fixture()
  f.llm.stream = async function* () {
    f.events.push({ type: 'user/message', seq: 6, data: { source: { kind: 'user' } } })
    yield { type: 'text-delta', index: 0, text: '添加并发场景测试' }
  }
  assert.equal(await f.predictor.predict(f.session), '')
  assert.equal(f.cache.size, 0)
})

test('DSH terminal failures are errors, never cached partial suggestions', async () => {
  for (const kind of ['error', 'aborted']) {
    const f = fixture()
    f.llm.stream = async function* () {
      yield { type: 'text-delta', index: 0, text: '添加并发场景测试' }
      yield { type: 'finish', reason: { kind, failure: { message: 'provider unavailable', code: 'TEST', status: 503 } } }
    }
    await assert.rejects(f.predictor.predict(f.session), /provider unavailable/)
    assert.equal(f.cache.size, 0)
  }
  const f = fixture()
  f.llm.stream = async function* () {
    yield { type: 'text-delta', index: 0, text: '添加并发场景测试' }
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
  }
  assert.equal(await f.predictor.predict(f.session), '')
})

test('only a temperature-specific 400 gets one retry with a fresh timeout', async () => {
  for (const message of ['unsupported temperature', 'invalid model']) {
    const f = fixture()
    f.llm.stream = async function* (options) {
      f.calls.push(options)
      if (f.calls.length === 1) yield { type: 'finish', reason: { kind: 'error', failure: { message, code: 'BAD_REQUEST', status: 400 } } }
      else yield { type: 'text-delta', index: 0, text: '添加并发场景测试' }
    }
    if (message.includes('temperature')) {
      assert.equal(await f.predictor.predict(f.session), '添加并发场景测试')
      assert.equal(f.calls.length, 2)
      assert.equal(f.calls[1].temperature, undefined)
      assert.notEqual(f.calls[0].signal, f.calls[1].signal)
    } else {
      await assert.rejects(f.predictor.predict(f.session), /invalid model/)
      assert.equal(f.calls.length, 1)
    }
  }
})

test('transcript budget, synthetic messages, long output, and edit boundary', () => {
  const transcript = contextOf(Array.from({ length: 40 }, (_, i) => message(i % 2 ? 'assistant' : 'user', 'x'.repeat(4000))))
  assert.ok(transcript.length <= 24000)
  assert.ok(!contextOf([{ ...message('user', 'runtime secret'), source: { kind: 'runtime-context' } }, message('assistant', 'done')]).includes('runtime secret'))
  assert.equal(usablePrediction(sanitize('字'.repeat(241)), ''), '')
  assert.equal(usablePrediction('I want to add a search box', 'done'), 'I want to add a search box')
  for (const field of ['__proto__', 'constructor', 'toString']) assert.equal(normalizeEdit(field, 1).reason, 'unknown-field')
  assert.equal(normalizeEdit('cacheMaxEntries', 1.5).reason, 'invalid-value')
  const force = TYPERT.invocations.find(i => i.method === 'predict').parameters.find(p => p.name === 'force')
  assert.equal(force.codec.create().parse(undefined), undefined)
})

test('the real Cordis host starts without HTTP services; web routes attach later and enforce admission', async () => {
  const ctx = new Context()
  ctx.provide('sessions', { get: () => undefined })
  const fork = ctx.plugin(plugin, {})
  await fork
  assert.deepEqual(await ctx.get('nextSuggestion').predict('missing'), { code: 'unknown-session' })
  assert.equal(ctx.get('nextSuggestion').getConfig().editable, false)
  let route
  ctx.provide('connection', { requestRejection: () => 403 })
  ctx.provide('webServer', { register(value) { route = value; return () => {} } })
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(route)
  async function request(url, body = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = 'POST'
    req.url = url
    return new Promise(resolve => {
      let status
      route.handler(req, { writeHead(value) { status = value }, end(value) { resolve({ status, body: JSON.parse(value) }) } })
    })
  }
  assert.equal((await request('/next-suggestion/api/predict')).status, 403)
  ctx.get('connection').requestRejection = () => undefined
  assert.equal((await request('/next-suggestion/api/config', { field: '__proto__', value: 1 })).status, 400)
  assert.equal((await request('/next-suggestion/api/config', { field: 'cacheMaxEntries', value: 1.5 })).status, 400)
  assert.equal((await request('/next-suggestion/api/predict', { sessionId: 'missing' })).status, 404)
  ctx.get('sessions').get = () => { throw new Error('store failed') }
  assert.equal((await request('/next-suggestion/api/predict', { sessionId: 's' })).status, 500)
  await fork.dispose()
})


test('diagnostics are opt-in, private, and do not follow a symlink log target', () => {
  const home = mkdtempSync(join(tmpdir(), 'next-suggestion-logs-'))
  const previous = process.env.DSH_NEXT_SUGGESTION_ALWAYS_LOG
  delete process.env.DSH_NEXT_SUGGESTION_ALWAYS_LOG
  try {
    const flag = join(home, 'next-suggestion-debug')
    const log = join(home, 'logs', 'next-suggestion.log')
    const debug = createDiagnostics({ home })
    debug('off', { text: 'not logged' })
    assert.equal(existsSync(log), false)
    writeFileSync(flag, '')
    debug('enabled', { text: 'test content' })
    assert.match(readFileSync(log, 'utf8'), /enabled/)
    assert.equal(statSync(log).mode & 0o777, 0o600)
    assert.equal(statSync(join(home, 'logs')).mode & 0o777, 0o700)
    chmodSync(log, 0o644)
    debug('again', {})
    assert.equal(statSync(log).mode & 0o777, 0o600)
    unlinkSync(log)
    const target = join(home, 'unrelated-file')
    writeFileSync(target, 'unchanged')
    symlinkSync(target, log)
    assert.doesNotThrow(() => debug('symlink', {}))
    assert.equal(readFileSync(target, 'utf8'), 'unchanged')
  } finally {
    if (previous === undefined) delete process.env.DSH_NEXT_SUGGESTION_ALWAYS_LOG
    else process.env.DSH_NEXT_SUGGESTION_ALWAYS_LOG = previous
    rmSync(home, { recursive: true, force: true })
  }
})
