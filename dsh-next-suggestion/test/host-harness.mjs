// Pure-function and manifest checks. Runtime integration lives in runtime-harness.mjs.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'

import {
  MAX_PREDICTION_CHARS,
  SYSTEM_PROMPT,
  contextOf,
  preferredEffortOf,
  sanitize,
  similarity,
  usablePrediction,
} from '../lib/prompt.js'
import {
  findSettingsDescriptor,
  normalizeEdit,
  resolveConfig,
  unwrapRef,
} from '../lib/settings.js'
import { createPredictionCache } from '../lib/cache.js'
import { json, readJsonBody } from '../lib/http.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let failures = 0

function fail(name, message) {
  failures += 1
  console.error(`FAIL ${name}: ${message}`)
}

function ok(value, name, message) {
  if (!value) fail(name, message ?? 'expected truthy')
}

function equal(actual, expected, name, message) {
  if (!Object.is(actual, expected)) {
    fail(name, message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function check(name, run) {
  try {
    run()
  } catch (error) {
    fail(name, error?.stack ?? String(error))
  }
}

async function checkAsync(name, run) {
  try {
    await run()
  } catch (error) {
    fail(name, error?.stack ?? String(error))
  }
}

const message = (role, text) => ({ role, content: [{ type: 'text', text }] })

// 1 -----------------------------------------------------------------------
check('contextOf keeps turns in order', () => {
  const transcript = contextOf([
    message('user', '帮我看下服务'),
    message('assistant', '好的，服务日志在这里'),
    message('user', '重启一下'),
    message('assistant', '已重启，当前状态正常'),
  ])
  const lines = transcript.split('\n')
  equal(lines.length, 4, 'contextOf keeps turns in order', 'expected four lines')
  ok(lines[0].startsWith('User: '), 'contextOf keeps turns in order', 'first line should be the user turn')
  ok(transcript.includes('Assistant: 已重启，当前状态正常'), 'contextOf keeps turns in order', 'latest assistant turn missing')
  ok(lines[3].startsWith('Assistant: '), 'contextOf keeps turns in order', 'last line should be the assistant turn')
})

// 2 -----------------------------------------------------------------------
check('contextOf bounds messages, characters and per-message length', () => {
  const messages = []
  for (let index = 0; index < 60; index += 1) {
    messages.push(message(index % 2 === 0 ? 'user' : 'assistant', `消息 ${String(index).padStart(2, '0')}`))
  }
  const transcript = contextOf(messages)
  const lines = transcript.split('\n')
  ok(lines.length <= 40, 'contextOf bounds messages, characters and per-message length', 'more than 40 lines kept')
  equal(lines.length, 40, 'contextOf bounds messages, characters and per-message length', 'expected the newest 40 messages')
  ok(transcript.length <= 24000, 'contextOf bounds messages, characters and per-message length', `transcript too long: ${transcript.length}`)
  ok(transcript.includes('消息 59'), 'contextOf bounds messages, characters and per-message length', 'newest message dropped')
  ok(transcript.includes('消息 20'), 'contextOf bounds messages, characters and per-message length', 'boundary message dropped')
  ok(!transcript.includes('消息 19'), 'contextOf bounds messages, characters and per-message length', 'oldest kept message should be dropped')
  ok(!transcript.includes('消息 00'), 'contextOf bounds messages, characters and per-message length', 'oldest message should be dropped')

  const capped = contextOf([message('user', '长'.repeat(9000))])
  equal(capped.length, 'User: '.length + 4000, 'contextOf bounds messages, characters and per-message length', 'per-message cap wrong')
})

// 3 -----------------------------------------------------------------------
check('config defaults and overrides resolve without merging by hand', () => {
  const defaults = resolveConfig()
  equal(defaults.cacheTtlMs, 1800000)
  equal(defaults.cacheMaxEntries, 200)
  equal(defaults.preferredReasoningEffort, 'high')
  equal(defaults.fallbackPollMs, 30000)

  const partial = resolveConfig({ cacheTtlMs: 900000 })
  equal(partial.cacheTtlMs, 900000)
  equal(partial.cacheMaxEntries, 200)

  const full = resolveConfig({ cacheTtlMs: 60000, cacheMaxEntries: 5000, preferredReasoningEffort: 'medium', fallbackPollMs: 45000 })
  equal(full.cacheTtlMs, 60000)
  equal(full.cacheMaxEntries, 5000)
  equal(full.preferredReasoningEffort, 'medium')
  equal(full.fallbackPollMs, 45000)

  const nulled = resolveConfig({ cacheTtlMs: null, cacheMaxEntries: null, preferredReasoningEffort: null, fallbackPollMs: null })
  equal(nulled.cacheTtlMs, 1800000)
  equal(nulled.preferredReasoningEffort, 'high')
})

// 4 -----------------------------------------------------------------------
check('SYSTEM_PROMPT carries the six behaviours in its own words', () => {
  ok(SYSTEM_PROMPT.startsWith('This request comes from the app'), 'SYSTEM_PROMPT carries the six behaviours in its own words', 'wrong opening')
  for (const phrase of [
    'comes from the app, not from the user',
    "in the user's empty message composer",
    'concrete action and the concrete thing',
    'Write it the way this user writes',
    'Prefer the most grounded next move',
    'at most 240 characters',
    'the single word null',
  ]) {
    ok(SYSTEM_PROMPT.includes(phrase), 'SYSTEM_PROMPT carries the six behaviours in its own words', `missing phrase: ${phrase}`)
  }
  equal(MAX_PREDICTION_CHARS, 240)
})

// 6 -----------------------------------------------------------------------
check('preferredEffortOf lands on high', () => {
  equal(preferredEffortOf([{ id: 'high' }, { id: 'low' }]), 'high', 'preferredEffortOf lands on high', 'exact match wins')
  equal(preferredEffortOf([{ id: 'low' }]), 'low', 'preferredEffortOf lands on high', 'nearest level below')
  equal(preferredEffortOf([{ id: 'medium' }]), 'medium', 'preferredEffortOf lands on high', 'nearest level above')
  equal(preferredEffortOf([{ id: 'high' }]), 'high', 'preferredEffortOf lands on high', 'only high')
  equal(preferredEffortOf([{ id: 'turbo' }, { id: 'mega' }]), 'turbo', 'preferredEffortOf lands on high', 'unknown ids fall back to the first')
  equal(preferredEffortOf(undefined), undefined, 'preferredEffortOf lands on high', 'no efforts advertised')
  equal(preferredEffortOf([]), undefined, 'preferredEffortOf lands on high', 'empty efforts')
})

// 7 -----------------------------------------------------------------------
check('sanitize strips decoration', () => {
  equal(sanitize('```\n看下日志\n```'), '看下日志', 'sanitize strips decoration', 'code fence')
  equal(sanitize('"看下日志"'), '看下日志', 'sanitize strips decoration', 'quotes')
  equal(sanitize('assistant: 看下日志'), '看下日志', 'sanitize strips decoration', 'speaker tag')
  equal(sanitize('好的，看下日志。'), '看下日志', 'sanitize strips decoration', 'chatty prefix and period')
  equal(sanitize('null'), '', 'sanitize strips decoration', 'literal null')
  equal(sanitize('"null"'), '', 'sanitize strips decoration', 'quoted null')
  equal(sanitize('null.'), '', 'sanitize strips decoration', 'null with period')
  equal(sanitize('NULL'), '', 'sanitize strips decoration', 'uppercase null')
  equal(sanitize('nullish'), 'nullish', 'sanitize strips decoration', 'nullish is a word, not null')
  equal(sanitize('{"suggestion": null}'), '', 'sanitize strips decoration', 'json null suggestion')
  equal(sanitize('{"suggestion": "看下日志"}'), '看下日志', 'sanitize strips decoration', 'json suggestion unwrapped')
})

// 8 -----------------------------------------------------------------------
check('usablePrediction rejects echo and assistant voice', () => {
  equal(usablePrediction('已把端口改为 8080 并重启', '我已把端口改为 8080 并重启了服务'), '', 'usablePrediction rejects echo and assistant voice', 'echo of the reply')
  equal(usablePrediction('以下是修改建议', '无关回复'), '', 'usablePrediction rejects echo and assistant voice', 'assistant voice prefix (zh)')
  equal(usablePrediction('Sure, here you go', 'unrelated reply'), '', 'usablePrediction rejects echo and assistant voice', 'assistant voice prefix (en)')
  equal(usablePrediction('看下日志', '服务已经在运行了'), '看下日志', 'usablePrediction rejects echo and assistant voice', 'short user message kept')
})

// 9 -----------------------------------------------------------------------
check('only a literal echo of the reply is rejected', () => {
  equal(usablePrediction('重启 nginx 服务', '建议先看下 nginx 日志中的错误码'), '重启 nginx 服务', 'literal echo rule', 'reusing nouns is not an echo')
  equal(usablePrediction('请重启 nginx 服务再试一次', '请重启 nginx 服务再试一次'), '', 'literal echo rule', 'copying the whole sentence is an echo')
  equal(usablePrediction('看下日志', '你可以先看下日志'), '看下日志', 'literal echo rule', 'shorter than eight characters is not judged')
})

// 10 ----------------------------------------------------------------------
check('similarity is symmetric', () => {
  const a = 'hello world'
  const b = 'world hello'
  equal(similarity(a, b), similarity(b, a), 'similarity is symmetric', 'symmetry')
  equal(similarity(a, a), 1, 'similarity is symmetric', 'self comparison')
})

// 11 ----------------------------------------------------------------------
check('every MAX_ constant used by the Host is defined or imported', () => {
  const files = ['index.js', 'lib/prediction.js', 'lib/prompt.js']
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8')
    const defined = new Set()
    for (const match of source.matchAll(/(?:const|let|var)\s+(MAX_[A-Z_]+)/g)) defined.add(match[1])
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      for (const name of match[1].split(',')) {
        const identifier = name.trim().split(/\s+as\s+/).pop()?.trim()
        if (identifier && identifier.startsWith('MAX_')) defined.add(identifier)
      }
    }
    for (const match of source.matchAll(/\b(MAX_[A-Z_]+)\b/g)) {
      ok(defined.has(match[1]), 'every MAX_ constant used by the Host is defined or imported', `${file} uses ${match[1]} without defining or importing it`)
    }
  }
})

// 12 ----------------------------------------------------------------------
check('cache pins a prediction to its assistant message', () => {
  const cache = createPredictionCache({ ttlMs: 1800000, maxEntries: 200 })
  const now = Date.now()
  cache.set('session-1', 'key-a', '预测一', now)
  equal(cache.get('session-1', 'key-a', now), '预测一', 'cache pins a prediction to its assistant message', 'direct hit')
  equal(cache.get('session-1', 'key-b', now), undefined, 'cache pins a prediction to its assistant message', 'stale key must miss')
  equal(cache.get('session-2', 'key-a', now), undefined, 'cache pins a prediction to its assistant message', 'other session must miss')
})

// 13 ----------------------------------------------------------------------
check('an empty prediction is still a cache hit', () => {
  const cache = createPredictionCache({ ttlMs: 1800000, maxEntries: 200 })
  const now = Date.now()
  cache.set('session-1', 'key-a', '', now)
  equal(cache.get('session-1', 'key-a', now), '', 'an empty prediction is still a cache hit', 'empty string must be a hit, not a miss')
})

// 14 ----------------------------------------------------------------------
check('empty results expire after the short TTL', () => {
  const cache = createPredictionCache({ ttlMs: 1800000, maxEntries: 200 })
  const now = Date.now()
  cache.set('session-1', 'key-a', '', now, 120000)
  equal(cache.get('session-1', 'key-a', now + 119999), '', 'empty results expire after the short TTL', 'still inside the short TTL')
  equal(cache.get('session-1', 'key-a', now + 120000), undefined, 'empty results expire after the short TTL', 'expired at the boundary')
})

// 15 ----------------------------------------------------------------------
check('entries expire at the TTL boundary and the oldest are evicted first', () => {
  const cache = createPredictionCache({ ttlMs: 1000, maxEntries: 2 })
  const now = Date.now()
  cache.set('session-1', 'key-a', '一', now)
  cache.set('session-2', 'key-a', '二', now)
  equal(cache.size, 2)
  cache.set('session-3', 'key-a', '三', now)
  equal(cache.size, 2, 'entries expire at the TTL boundary and the oldest are evicted first', 'capacity should stay at 2')
  equal(cache.get('session-1', 'key-a', now), undefined, 'entries expire at the TTL boundary and the oldest are evicted first', 'oldest entry should be evicted')
  equal(cache.get('session-2', 'key-a', now), '二', 'entries expire at the TTL boundary and the oldest are evicted first', 'newer entry should survive')
  equal(cache.get('session-3', 'key-a', now), '三', 'entries expire at the TTL boundary and the oldest are evicted first', 'newest entry should survive')
  equal(cache.get('session-3', 'key-a', now + 1000), undefined, 'entries expire at the TTL boundary and the oldest are evicted first', 'expired exactly at ttl')
})

// 16-17 -------------------------------------------------------------------
function requestOf(chunks) {
  const req = new EventEmitter()
  req.destroy = () => {}
  queueMicrotask(() => {
    for (const chunk of chunks) req.emit('data', chunk)
    req.emit('end')
  })
  return req
}

await checkAsync('readJsonBody parses JSON and treats an empty body as {}', async () => {
  const parsed = await readJsonBody(requestOf([Buffer.from('{"sessionId":"s1","force":true}')]))
  equal(parsed.sessionId, 's1', 'readJsonBody parses JSON and treats an empty body as {}', 'parsed body')
  equal(parsed.force, true, 'readJsonBody parses JSON and treats an empty body as {}', 'parsed flag')
  const empty = await readJsonBody(requestOf([]))
  equal(Object.keys(empty).length, 0, 'readJsonBody parses JSON and treats an empty body as {}', 'empty body should be {}')
})

await checkAsync('readJsonBody rejects oversized and malformed bodies', async () => {
  const oversized = await readJsonBody(requestOf([Buffer.alloc(65537, 'a')])).then(() => 'resolved', error => error)
  equal(oversized, 'body-too-large', 'readJsonBody rejects oversized and malformed bodies', 'oversized body')
  const malformed = await readJsonBody(requestOf([Buffer.from('{oops')])).then(() => 'resolved', error => error)
  ok(malformed instanceof Error, 'readJsonBody rejects oversized and malformed bodies', 'malformed JSON should throw')
})

// 18 ----------------------------------------------------------------------
check('json writes a JSON response', () => {
  const written = {}
  const res = {
    writeHead(status, headers) {
      written.status = status
      written.headers = headers
    },
    end(body) {
      written.body = body
    },
  }
  json(res, 201, { ok: true })
  equal(written.status, 201, 'json writes a JSON response', 'status code')
  equal(written.headers['content-type'], 'application/json; charset=utf-8', 'json writes a JSON response', 'content-type')
  equal(written.headers['cache-control'], 'no-store', 'json writes a JSON response', 'cache-control')
  equal(written.body, '{"ok":true}', 'json writes a JSON response', 'body')
})

// 19 ----------------------------------------------------------------------
check('resolveConfig reads volatile refs like plain values', () => {
  const resolved = resolveConfig({
    cacheTtlMs: { get: () => 900000 },
    preferredReasoningEffort: 'low',
  })
  equal(resolved.cacheTtlMs, 900000, 'resolveConfig reads volatile refs like plain values', 'volatile ref unwrapped')
  equal(resolved.preferredReasoningEffort, 'low', 'resolveConfig reads volatile refs like plain values', 'plain value kept')
  equal(unwrapRef(5), 5, 'resolveConfig reads volatile refs like plain values', 'plain value passes through')
  equal(unwrapRef({ get: () => 7 }), 7, 'resolveConfig reads volatile refs like plain values', 'ref is called')
})

// 20 ----------------------------------------------------------------------
check('normalizeEdit accepts numbers as strings, numbers and valid choices', () => {
  const asString = normalizeEdit('cacheTtlMs', '900000')
  ok(asString.ok, 'normalizeEdit accepts numbers as strings, numbers and valid choices', 'numeric string should pass')
  equal(asString.value, 900000, 'normalizeEdit accepts numbers as strings, numbers and valid choices', 'numeric string value')
  const asNumber = normalizeEdit('cacheMaxEntries', 500)
  ok(asNumber.ok && asNumber.value === 500, 'normalizeEdit accepts numbers as strings, numbers and valid choices', 'plain number')
  const choice = normalizeEdit('preferredReasoningEffort', 'medium')
  ok(choice.ok && choice.value === 'medium', 'normalizeEdit accepts numbers as strings, numbers and valid choices', 'valid choice')
  const interval = normalizeEdit('fallbackPollMs', 45000)
  ok(interval.ok && interval.value === 45000, 'normalizeEdit accepts numbers as strings, numbers and valid choices', 'fallback interval')
})

// 21 ----------------------------------------------------------------------
check('normalizeEdit rejects out-of-range, invalid and unknown edits', () => {
  equal(normalizeEdit('cacheTtlMs', 59999).reason, 'out-of-range', 'normalizeEdit rejects out-of-range, invalid and unknown edits', 'below the minimum')
  equal(normalizeEdit('cacheTtlMs', 86400001).reason, 'out-of-range', 'normalizeEdit rejects out-of-range, invalid and unknown edits', 'above the maximum')
  equal(normalizeEdit('cacheTtlMs', 'not-a-number').reason, 'invalid-value', 'normalizeEdit rejects out-of-range, invalid and unknown edits', 'non-numeric')
  equal(normalizeEdit('preferredReasoningEffort', 'extreme').reason, 'invalid-value', 'normalizeEdit rejects out-of-range, invalid and unknown edits', 'unknown choice')
  equal(normalizeEdit('nope', 1).reason, 'unknown-field', 'normalizeEdit rejects out-of-range, invalid and unknown edits', 'unknown field')
})

// 22 ----------------------------------------------------------------------
check('findSettingsDescriptor matches the loader row id in any profile layout', () => {
  equal(findSettingsDescriptor([{ ns: 'include:next-suggestion' }], 'next-suggestion')?.ns, 'include:next-suggestion', 'findSettingsDescriptor matches the loader row id in any profile layout', 'prefixed ns')
  equal(findSettingsDescriptor([{ ns: 'next-suggestion' }], 'next-suggestion')?.ns, 'next-suggestion', 'findSettingsDescriptor matches the loader row id in any profile layout', 'bare ns')
  equal(findSettingsDescriptor([{ ns: 'other-plugin' }], 'next-suggestion'), undefined, 'findSettingsDescriptor matches the loader row id in any profile layout', 'foreign ns')
  equal(findSettingsDescriptor(undefined, 'next-suggestion'), undefined, 'findSettingsDescriptor matches the loader row id in any profile layout', 'undefined is safe')
})

// 23 ----------------------------------------------------------------------
check('the package manifest exposes the host, web and typert halves', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const exports = manifest.exports ?? {}
  equal(exports['.'], './index.js', 'the package manifest exposes the host, web and typert halves', 'host entry')
  equal(exports['./client'], './client.js', 'the package manifest exposes the host, web and typert halves', 'web client entry')
  equal(exports['./typert'], './lib/typert.host.js', 'the package manifest exposes the host, web and typert halves', 'typert entry')
  equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml', 'the package manifest exposes the host, web and typert halves', 'bundle patch')
  equal(manifest.dsh?.client?.platform, 'web', 'the package manifest exposes the host, web and typert halves', 'web platform')
  ok(typeof manifest.engines?.dsh === 'string', 'the package manifest exposes the host, web and typert halves', 'dsh engine range')
  for (const path of ['./index.js', './client.js', './lib/typert.host.js', './cordis.patch.yml']) {
    ok(existsSync(join(root, path)), 'the package manifest exposes the host, web and typert halves', `${path} missing`)
  }
})

// 24 ----------------------------------------------------------------------
await checkAsync('the typert artifact declares a valid TYPERT manifest', async () => {
  const { TYPERT } = await import('../lib/typert.host.js')
  equal(TYPERT.package, 'dsh-next-suggestion', 'the typert artifact declares a valid TYPERT manifest', 'package owner')
  equal(TYPERT.face, 'host', 'the typert artifact declares a valid TYPERT manifest', 'host face')
  ok(Array.isArray(TYPERT.schemas), 'the typert artifact declares a valid TYPERT manifest', 'schemas array')
  ok(Array.isArray(TYPERT.model?.services), 'the typert artifact declares a valid TYPERT manifest', 'model services')
  const service = TYPERT.model.services.find(entry => entry.key === 'nextSuggestion')
  ok(service, 'the typert artifact declares a valid TYPERT manifest', 'nextSuggestion service declared')
  const methods = new Set(service.members.filter(member => member.kind === 'method').map(member => member.name))
  ok(methods.has('getConfig') && methods.has('predict') && methods.has('updateConfig'), 'the typert artifact declares a valid TYPERT manifest', 'service members')
  const ids = new Set()
  for (const invocation of TYPERT.invocations) {
    ok(!ids.has(invocation.id), 'the typert artifact declares a valid TYPERT manifest', `duplicate invocation id ${invocation.id}`)
    ids.add(invocation.id)
    equal(invocation.service, 'nextSuggestion', 'the typert artifact declares a valid TYPERT manifest', 'invocation service key')
    ok(methods.has(invocation.method), 'the typert artifact declares a valid TYPERT manifest', `${invocation.method} missing from model members`)
    equal(invocation.invocation?.kind, 'direct', 'the typert artifact declares a valid TYPERT manifest', 'direct invocation')
    for (const parameter of invocation.parameters ?? []) {
      equal(parameter.source, 'json', 'the typert artifact declares a valid TYPERT manifest', 'json parameter source')
      ok(typeof parameter.codec?.create === 'function', 'the typert artifact declares a valid TYPERT manifest', 'parameter codec factory')
    }
    equal(invocation.result?.mode, 'strict', 'the typert artifact declares a valid TYPERT manifest', 'strict result codec')
    ok(typeof invocation.result?.create === 'function', 'the typert artifact declares a valid TYPERT manifest', 'result codec factory')
    invocation.result.create().parse(invocation.method === 'getConfig'
      ? { values: { cacheTtlMs: 1800000, cacheMaxEntries: 200, preferredReasoningEffort: 'high', fallbackPollMs: 30000 }, editable: true, fallbackPollMs: 30000 }
      : invocation.method === 'predict'
        ? { text: '' }
        : { code: 'not-editable' })
  }
})

// -------------------------------------------------------------------------
if (failures === 0) {
  console.log('host-half harness: OK')
} else {
  console.log('host-half harness: FAILED')
  process.exitCode = 1
}
