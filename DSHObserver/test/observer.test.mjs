import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createObserver, usageMetrics } from '../core.mjs'
import { createSink } from '../storage.mjs'
import { analyze, correlation, csv } from '../analysis.mjs'
import { exportReport, parseLines } from '../cli.mjs'

function fixture() {
  const rows = [], marked = new WeakSet()
  let time = 0
  const observer = createObserver({ emit: r => rows.push(r), isLoopRequest: r => marked.has(r), mono: () => time,
    wall: () => 1700000000000 + time, cpu: () => ({ user: time * 1000, system: 0 }), memory: () => 100,
    elu: () => ({ active: time / 2, idle: time / 2 }) })
  const request = { sessionId: 'session', provider: 'fixture', model: 'model', reasoningEffort: 'high', messages: [
    { role: 'system', content: [{ type: 'text', text: 'PRIVATE SYSTEM' }] },
    { role: 'user', content: [{ type: 'text', text: 'PRIVATE PROMPT' }] }], tools: [{ name: 'test', parameters: { secret: 'PRIVATE SCHEMA' } }] }
  const event = (type, data, at = time) => observer.onEvent({ id: 'session' }, { type, data, time: at, seq: rows.length })
  const drain = async (req, list) => { const out = []; for await (const c of observer.stream(req, async function* () { for (const [t, c] of list) { time = t; yield c } })) out.push(c); return out }
  return { rows, observer, marked, request, event, drain, setTime: t => { time = t } }
}
const text = value => ({ type: 'text-delta', index: 0, text: value })
const finish = kind => ({ type: 'finish', reason: { kind } })
const usage = { type: 'usage', usage: { inputTokens: 20, cacheReadTokens: 70, cacheWriteTokens: 10, outputTokens: 100, reasoningTokens: 40 } }

test('per-attempt context, TTFT, reasoning/tool deltas and decode TPS use distinct clocks and disjoint usage', async () => {
  const f = fixture(); f.marked.add(f.request)
  f.event('step/start', { turn: 3, step: 2 }); f.event('request/context', { provider: 'fixture', model: 'model', contextWindow: 1000 })
  const list = [[10, text('')], [100, { type: 'reasoning-delta', index: 0, text: 'PRIVATE REASONING' }],
    [200, text('PRIVATE OUTPUT')], [500, { type: 'tool-call-delta', index: 1, id: 'c', name: 'test', argumentsDelta: 'PRIVATE ARG' }],
    [600, usage], [1100, finish('tool-calls')]]
  const chunks = await f.drain(Object.freeze(f.request), list)
  assert.deepEqual(chunks, list.map(x => x[1]))
  const r = f.rows.at(-1)
  assert.equal(r.contextTokens, 100); assert.equal(r.cacheHitRatio, .7); assert.equal(r.contextOccupancy, .1)
  assert.equal(r.ttftMs, 100); assert.equal(r.firstTextMs, 200); assert.equal(r.decodeMs, 1000); assert.equal(r.decodeTps, 100)
  assert.equal(r.turn, 3); assert.equal(r.step, 2); assert.equal(r.attempt, 1); assert.equal(r.outputToolCalls, 1)
  assert.equal(r.gapMaxMs, 300); assert.equal(r.gapP95UpperMs, 512)
  assert.equal(r.messageCount, 2); assert.equal(r.systemMessages, 1); assert.equal(r.userMessages, 1)
  assert.ok(!JSON.stringify(f.rows).includes('PRIVATE'))
})

test('retries create distinct attempts; auxiliary calls never inherit conversation step or retries', async () => {
  const f = fixture(); f.marked.add(f.request); f.event('step/start', { turn: 1, step: 1 })
  await f.drain(f.request, [[1000, { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'PRIVATE' } } }]])
  f.event('llm/retry', { turn: 1, step: 1, retry: 1, delayMs: 1000, provider: 'fixture', failure: { code: 'TRANSPORT', message: 'PRIVATE' } })
  f.setTime(2000)
  await f.drain({ ...f.request, purpose: 'session-title' }, [[2050, text('title')], [2100, finish('stop')]])
  f.setTime(3000)
  await f.drain(f.request, [[3100, text('ok')], [3200, usage], [4100, finish('stop')]])
  const ends = f.rows.filter(r => r.kind === 'call-end')
  assert.equal(ends[0].status, 'error'); assert.equal(ends[0].decodeTps, null)
  assert.equal(ends[1].turn, null); assert.equal(ends[1].retriesBefore, null)
  assert.equal(ends[2].decodeTps, 100); assert.equal(ends[2].ttftMs, 100); assert.equal(ends[2].attempt, 2); assert.equal(ends[2].retriesBefore, 1)
  assert.equal(analyze(f.rows).eligibleCalls, 1); assert.ok(!JSON.stringify(f.rows).includes('PRIVATE'))
})

test('missing usage, no content and zero decode duration stay unknown', async () => {
  const f = fixture()
  await f.drain(f.request, [[100, text('x')], [100, finish('stop')]])
  assert.equal(f.rows.at(-1).decodeTps, null); assert.equal(f.rows.at(-1).contextTokens, null)
  await f.drain(f.request, [[110, usage], [120, finish('stop')]])
  assert.equal(f.rows.at(-1).decodeTps, null)
  assert.equal(usageMetrics({ inputTokens: 0, outputTokens: 0 }).contextTokens, 0)
  assert.equal(usageMetrics({ outputTokens: 1 }).inputTokens, null)
})

test('consumer pacing is measured separately; concurrent overlap peaks survive between chunks', async () => {
  const f = fixture()
  const iterator = f.observer.stream(f.request, async function* () { yield text('a'); yield usage; yield finish('stop') })[Symbol.asyncIterator]()
  await iterator.next(); f.setTime(50)
  await f.drain({ ...f.request, purpose: 'session-title' }, [[60, text('b')], [70, finish('stop')]])
  f.setTime(100); await iterator.next(); await iterator.next(); await iterator.next()
  const end = f.rows.at(-1)
  assert.equal(end.maxConcurrent, 2); assert.equal(end.activeAtStart, 1); assert.equal(end.consumerWaitMs, 100)
  assert.equal(end.decodeMs, 100)
})

test('throw, cancellation and consumer early close preserve original stream behavior', async () => {
  const f = fixture(), error = new Error('PRIVATE EXCEPTION')
  await assert.rejects(async () => { for await (const c of f.observer.stream(f.request, async function* () { yield text('x'); throw error })) void c }, e => e === error)
  assert.equal(f.rows.at(-1).status, 'thrown'); assert.equal(f.rows.at(-1).decodeTps, null)
  for await (const c of f.observer.stream(f.request, async function* () { yield text('x'); yield finish('stop') })) { void c; break }
  assert.equal(f.rows.at(-1).status, 'consumer-closed')
  const signal = AbortSignal.abort()
  await f.drain({ ...f.request, signal }, [[100, finish('aborted')]])
  assert.equal(f.rows.at(-1).status, 'aborted'); assert.ok(!JSON.stringify(f.rows).includes('PRIVATE'))
})

test('tool latency uses call-to-result boundaries, never contributes to decode TPS', () => {
  const f = fixture()
  f.event('tool/call', { turn: 1, step: 2, callId: 'c', name: 'read', arguments: 'PRIVATE ARGUMENT' }, 1000)
  f.event('tool/result', { turn: 1, step: 2, message: { source: { callId: 'c' }, content: [{ type: 'text', text: 'PRIVATE RESULT' }], isError: false } }, 6000)
  assert.equal(f.rows.at(-1).callToResultMs, 5000); assert.equal(f.rows.at(-1).toolName, 'read')
  assert.ok(!JSON.stringify(f.rows).includes('PRIVATE'))
})

test('sink appends without overwriting, drains on close, reports overflow and IO failures', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-observer-')), warnings = []
  const s = createSink(dir, { limit: 2 }); s.write({ x: 1 }); s.write({ x: 2 }); s.write({ x: 3 })
  const p = s.flush(); s.write({ x: 4 }); await p; await s.close()
  const rows = parseLines(await readFile(s.file, 'utf8'))
  assert.deepEqual(rows.filter(r => r.x).map(r => r.x), [1, 2, 4]); assert.equal(rows.find(r => r.kind === 'data-loss').dropped, 1)
  const file = join(dir, 'blocked'); await writeFile(file, 'preserved')
  const broken = createSink(file, { warn: s => warnings.push(s) }); broken.write({ x: 1 }); await broken.close()
  assert.equal(warnings.length, 2); assert.equal(await readFile(file, 'utf8'), 'preserved')
})

test('correlations handle nulls, constant variables and insufficient samples; group by route and effort', () => {
  assert.deepEqual(correlation([{ x: 1, decodeTps: null }, { x: 2, decodeTps: 4 }], 'x'), { n: 1, pearson: null })
  assert.equal(correlation([1, 2, 3].map(x => ({ x, decodeTps: x * 2 })), 'x').pearson, 1)
  assert.equal(correlation([1, 2, 3].map(x => ({ x: 1, decodeTps: x })), 'x').pearson, null)
  const rows = [1, 2, 3].map(x => ({ kind: 'call-end', status: 'stop', provider: 'a', model: 'm', reasoningEffort: 'high', purpose: 'conversation', contextTokens: x * 10000, outputTokens: x * 10, decodeMs: 1000, decodeTps: x * 10 }))
  const report = analyze([...rows, { ...rows[0], reasoningEffort: 'low' }, { ...rows[0], status: 'aborted' }])
  assert.equal(report.groups.length, 2); assert.equal(report.eligibleCalls, 4); assert.equal(report.excludedCalls, 1)
  assert.equal(report.groups[0].correlations.contextTokens.pearson, 1); assert.equal(report.groups[0].contextBins.length, 3)
  assert.ok(csv([{ model: '=TEST()', value: 3 }]).includes("'=TEST()"))
})

test('CLI produces inspectable CSV/JSON/Markdown exports, refuses overwrite and malformed evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-observer-export-')), input = join(dir, 'input')
  await mkdir(input)
  await writeFile(join(input, 'run-test.jsonl'), JSON.stringify({ kind: 'call-start', callId: 'inflight' }) + '\n')
  const out = join(dir, 'report'), report = await exportReport(input, out)
  assert.equal(report.unfinishedCalls, 1); assert.equal((await readdir(out)).length, 4)
  assert.match(await readFile(join(out, 'report.md'), 'utf8'), /相关性不能证明因果/)
  await assert.rejects(() => exportReport(input, out), { code: 'EEXIST' })
  assert.throws(() => parseLines('{broken\n', 'fixture'), /fixture:1: invalid JSON/)
})
