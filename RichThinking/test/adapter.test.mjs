import test from 'node:test'
import assert from 'node:assert/strict'
import { source, dom, addRow, flush, makeClock } from './helpers.mjs'
const { RunningStatusAdapter } = await source('adapter')
const { normalize } = await source('config')
function status(doc, prefix = '深度求索中', suffix = '，用时 2分2秒 ···') {
  const row = doc.createElement('div')
  row.setAttribute('data-chat-running', '')
  row.innerHTML = `<span role="status">${prefix}</span><span aria-hidden="true"></span><span><span aria-hidden="true"><svg><path d="M0 0"/></svg></span><span data-shimmer="true"><span><span>${prefix}${suffix}</span></span><span aria-hidden="true"><span data-shimmer-text="${prefix}${suffix}"></span></span></span></span>`
  doc.body.append(row)
  return { row, title: row.querySelector('[data-shimmer] > span > span'), whale: row.querySelector('svg').parentElement }
}
function setup(t, config = {}) {
  const env = dom(), doc = env.window.document, clock = makeClock()
  const adapter = new RunningStatusAdapter(doc, normalize(config), clock, () => 0.3)
  adapter.start()
  t.after(() => { adapter.dispose(); env.close() })
  return { env, doc, clock, adapter }
}
test('only bottom status changes; reasoning/group and whale stay native', async t => {
  const { doc, clock, adapter } = setup(t)
  const reasoning = addRow(doc), original = reasoning.item.outerHTML
  const group = doc.createElement('div')
  group.innerHTML = '<div data-step-process><button data-process-activity="thinking" aria-expanded="false">思考中</button></div>'
  doc.body.append(group)
  const groupOriginal = group.outerHTML
  const { row, title, whale } = status(doc), whaleMarkup = whale.outerHTML
  await flush()
  assert.equal(adapter.getSnapshot().length, 1)
  assert.equal(adapter.getSnapshot()[0].suffix, '，用时 2分2秒 ···')
  assert.ok(row.querySelector('[data-rich-thinking-host]'))
  const first = adapter.getSnapshot()[0].word
  clock.advance(5000)
  assert.notEqual(adapter.getSnapshot()[0].word, first)
  assert.equal(adapter.getSnapshot()[0].suffix, '，用时 2分2秒 ···')
  assert.equal(title.textContent, '深度求索中，用时 2分2秒 ···')
  assert.equal(whale.outerHTML, whaleMarkup)
  assert.equal(row.querySelector('svg').parentElement, whale)
  assert.equal(reasoning.item.outerHTML, original)
  assert.equal(group.outerHTML, groupOriginal)
})
test('native duration updates verbatim without plugin clock; legacy setting cannot hide it', async t => {
  const { doc, clock, adapter } = setup(t, { vocabularyMode: 'replace', chineseVerbs: ['琢磨中'], showElapsed: false })
  const { title } = status(doc)
  await flush()
  assert.equal(clock.size, 0)
  title.firstChild.data = '深度求索中，用时 2分3秒 ···'
  await flush()
  assert.equal(adapter.getSnapshot()[0].suffix, '，用时 2分3秒 ···')
  title.textContent = '深度求索中，用时 1小时2分3秒 ···'
  await flush()
  assert.equal(adapter.getSnapshot()[0].suffix, '，用时 1小时2分3秒 ···')
  adapter.update(normalize({ enabled: false }))
  adapter.update(normalize({ vocabularyMode: 'replace', chineseVerbs: ['琢磨中'] }))
  assert.equal(adapter.getSnapshot()[0].suffix, '，用时 1小时2分3秒 ···')
})
test('English native suffix, missing start time and unknown format', async t => {
  const { doc, adapter } = setup(t)
  const a = status(doc, 'Deep diving', ' for 2m 2s ···')
  status(doc, '深度求索中', '')
  await flush()
  assert.deepEqual(adapter.getSnapshot().map(x => x.suffix), [' for 2m 2s ···', ''])
  a.title.textContent = 'Unexpected upstream format'
  await flush()
  assert.equal(a.row.querySelector('[data-rich-thinking-host]'), null)
})
test('reasoning/tools do not create status or drive rotation; two statuses share one clock', async t => {
  const { doc, clock, adapter } = setup(t)
  const reasoning = addRow(doc)
  await flush()
  assert.equal(clock.size, 0)
  const a = status(doc), b = status(doc)
  await flush()
  let updates = 0
  adapter.subscribe(() => updates++)
  for (let i = 0; i < 30; i++) { reasoning.body.innerHTML = `<p>chunk ${i}</p>`; await flush() }
  reasoning.row.dataset.state = 'ok'
  addRow(doc, { kind: 'tool-call' })
  await flush()
  assert.equal(updates, 0)
  assert.equal(clock.starts, 1)
  for (let i = 0; i < 240; i++) clock.advance(5000)
  assert.equal(adapter.getSnapshot()[0].suffix, '，用时 2分2秒 ···')
  a.row.remove(); await flush()
  assert.equal(clock.size, 1)
  b.row.remove(); await flush()
  assert.equal(clock.size, 0)
  assert.equal(adapter.getSnapshot().length, 0)
})
test('visibility, preferences and disposal restore native UI without resetting duration', async t => {
  const { env, doc, clock, adapter } = setup(t)
  const { row, title } = status(doc)
  await flush()
  env.reduce(true)
  assert.equal(adapter.getSnapshot()[0].motion, false)
  row.hidden = true; await flush()
  assert.equal(clock.size, 0)
  row.hidden = false; await flush()
  assert.equal(clock.size, 1)
  Object.defineProperty(doc, 'hidden', { configurable: true, value: true })
  doc.dispatchEvent(new env.window.Event('visibilitychange'))
  assert.equal(clock.size, 0)
  Object.defineProperty(doc, 'hidden', { configurable: true, value: false })
  doc.dispatchEvent(new env.window.Event('visibilitychange'))
  adapter.update(normalize({ vocabularyMode: 'replace', language: 'en', englishVerbs: ['Pondering'] }))
  assert.equal(adapter.getSnapshot()[0].word, 'Pondering')
  assert.equal(adapter.getSnapshot()[0].suffix, '，用时 2分2秒 ···')
  adapter.dispose(); adapter.dispose()
  assert.equal(clock.size, 0)
  assert.equal(env.mediaListeners.size, 0)
  assert.equal(title.hasAttribute('data-rich-thinking-title'), false)
  assert.equal(row.querySelector('[data-rich-thinking-host]'), null)
})
