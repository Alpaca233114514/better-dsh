import test from 'node:test'
import assert from 'node:assert/strict'
import { source, dom, addRow, flush, makeClock } from './helpers.mjs'
const { ReasoningAdapter } = await source('adapter')
const { normalize } = await source('config')

test('native bottom running indicator remains untouched while reasoning verbs rotate', async t => {
  const { doc, clock, adapter } = setup(t)
  const status = doc.createElement('div')
  status.setAttribute('data-chat-running', '')
  status.innerHTML = '<span role="status">深度求索中</span><span>深度求索中，用时 1秒 ···</span>'
  doc.body.append(status)
  const original = status.outerHTML
  addRow(doc)
  await flush()
  assert.equal(adapter.getSnapshot().length, 1)
  clock.advance(5000)
  assert.equal(status.outerHTML, original)
  assert.equal(status.querySelector('[data-rich-thinking-host]'), null)
})

test('standard collapsed group follows real reasoning, expansion and tool phases', async t => {
  const { doc, clock, adapter } = setup(t)
  const group = doc.createElement('div')
  group.setAttribute('data-step-process', '')
  group.innerHTML = '<div><button data-process-activity="thinking" aria-expanded="false"><span></span><span data-shimmer="true"><span><span>思考中</span></span><span aria-hidden="true"></span></span></button></div><div data-step-process-body hidden="until-found"></div>'
  const native = addRow(doc)
  const body = group.querySelector('[data-step-process-body]')
  const button = group.querySelector('button')
  body.append(native.item)
  doc.body.append(group)
  await flush()
  assert.equal(adapter.getSnapshot().length, 1)
  assert.ok(button.querySelector('[data-rich-thinking-host]'))
  assert.equal(native.row.querySelector('[data-rich-thinking-host]'), null)
  button.setAttribute('aria-expanded', 'true')
  body.removeAttribute('hidden')
  await flush()
  assert.equal(adapter.getSnapshot().length, 1)
  assert.ok(native.header.querySelector('[data-rich-thinking-host]'))
  assert.equal(button.querySelector('[data-rich-thinking-host]'), null)
  button.setAttribute('aria-expanded', 'false')
  body.setAttribute('hidden', 'until-found')
  await flush()
  assert.ok(button.querySelector('[data-rich-thinking-host]'))
  button.setAttribute('data-process-activity', 'read')
  await flush()
  assert.equal(clock.size, 0)
  assert.equal(button.querySelector('[data-rich-thinking-host]'), null)
  button.setAttribute('data-process-activity', 'thinking')
  native.row.dataset.state = 'ok'
  await flush()
  assert.equal(clock.size, 0)
  native.row.dataset.state = 'running'
  await flush()
  assert.equal(clock.size, 1)
  group.setAttribute('hidden', '')
  await flush()
  assert.equal(clock.size, 0)
})

function setup(t, preferences = {}, initial) {
  const env = dom(), doc = env.window.document, clock = makeClock()
  initial?.(doc)
  const adapter = new ReasoningAdapter(doc, normalize(preferences), clock, () => 0.3)
  adapter.start()
  t.after(() => { adapter.dispose(); env.close() })
  return { env, doc, clock, adapter }
}

test('reasoning streams keep the original title, body, node identity and keyboard handler', async t => {
  const { doc, clock, adapter } = setup(t)
  const native = addRow(doc)
  const body = native.body.innerHTML
  let clicks = 0
  native.header.addEventListener('keydown', event => { if (event.key === 'Enter') clicks++ })
  await flush()
  assert.equal(adapter.getSnapshot().length, 1)
  assert.equal(clock.size, 1)
  assert.equal(native.title.textContent, 'Think')
  assert.equal(native.body.innerHTML, body)
  const id = adapter.getSnapshot()[0].id
  native.body.firstChild.textContent += ' streaming continuation'
  native.header.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Enter' }))
  await flush()
  assert.equal(adapter.getSnapshot()[0].id, id)
  assert.equal(clicks, 1)
  assert.equal(clock.starts, 1)
  const word = adapter.getSnapshot()[0].word
  clock.advance(5000)
  assert.notEqual(adapter.getSnapshot()[0].word, word)
  assert.equal(adapter.getSnapshot()[0].elapsed, 5)
})

test('waiting and non-reasoning models create no fake reasoning or clock', async t => {
  const { doc, clock, adapter } = setup(t)
  doc.body.innerHTML = '<div data-chat-running>Working</div><div data-chat-flow-kind="assistant-step">Actual answer</div>'
  await flush()
  assert.equal(adapter.getSnapshot().length, 0)
  assert.equal(clock.size, 0)
  assert.equal(doc.body.textContent, 'WorkingActual answer')
})

test('tool calls stay native; reasoning → tool → model continuation isolates each phase', async t => {
  const { doc, clock, adapter } = setup(t)
  const reasoning = addRow(doc)
  await flush()
  reasoning.row.dataset.state = 'ok'
  const tool = addRow(doc, { kind: 'tool-call', text: 'Reading file' })
  await flush()
  assert.equal(clock.size, 0)
  assert.equal(adapter.getSnapshot().length, 0)
  assert.equal(tool.row.hasAttribute('data-rich-thinking'), false)
  addRow(doc)
  await flush()
  assert.equal(clock.size, 1)
  assert.equal(adapter.getSnapshot()[0].elapsed, 0)
})

for (const event of ['answer begins', 'complete', 'cancel', 'error']) {
  test(`${event}: native running=false restores header and stops timer immediately`, async t => {
    const { doc, clock, adapter } = setup(t)
    const native = addRow(doc)
    await flush()
    native.row.dataset.state = 'ok' // Actual ReasoningRow contract for running=false, including interrupted.
    await flush()
    assert.equal(clock.size, 0)
    assert.equal(adapter.getSnapshot().length, 0)
    assert.equal(native.row.hasAttribute('data-rich-thinking'), false)
    assert.equal(native.title.hasAttribute('data-rich-thinking-title'), false)
    assert.equal(native.row.querySelector('[data-rich-thinking-host]'), null)
  })
}

test('retry removal and a new stream reset the observed duration', async t => {
  const { doc, clock, adapter } = setup(t)
  const first = addRow(doc)
  await flush()
  clock.advance(9000)
  first.item.remove()
  await flush()
  assert.equal(clock.size, 0)
  addRow(doc)
  await flush()
  assert.equal(adapter.getSnapshot()[0].elapsed, 0)
})

test('1000 historical rows have no clocks or rewritten completion times', t => {
  const { doc, clock, adapter } = setup(t, {}, doc => {
    for (let i = 0; i < 1000; i++) addRow(doc, { running: false })
  })
  assert.equal(clock.size, 0)
  assert.equal(adapter.getSnapshot().length, 0)
  assert.equal(doc.querySelectorAll('[data-rich-thinking-host]').length, 0)
})

test('long runs and multiple visible sessions share exactly one clock', async t => {
  const { doc, clock, adapter } = setup(t)
  const first = addRow(doc), second = addRow(doc)
  await flush()
  assert.equal(adapter.getSnapshot().length, 2)
  assert.equal(clock.size, 1)
  for (let i = 0; i < 240; i++) clock.advance(5000)
  assert.equal(adapter.getSnapshot()[0].elapsed, 1200)
  first.item.remove()
  await flush()
  assert.equal(adapter.getSnapshot().length, 1)
  assert.equal(clock.size, 1)
  second.item.remove()
  await flush()
  assert.equal(clock.size, 0)
})

test('settings disable/re-enable and language changes never combine Chinese and English', async t => {
  const { doc, clock, adapter } = setup(t)
  const native = addRow(doc)
  await flush()
  assert.match(adapter.getSnapshot()[0].word, /中$/)
  adapter.update(normalize({ enabled: false }), 'en')
  assert.equal(clock.size, 0)
  assert.equal(native.row.hasAttribute('data-rich-thinking'), false)
  adapter.update(normalize({ language: 'en', vocabularyMode: 'replace', englishVerbs: ['Only English'], chineseVerbs: ['只用中文中'] }), 'zh')
  assert.equal(adapter.getSnapshot()[0].word, 'Only English')
  adapter.update(normalize({ vocabularyMode: 'replace', chineseVerbs: ['只用中文中'], showElapsed: false, animation: false }), 'en')
  assert.equal(adapter.getSnapshot()[0].word, '只用中文中')
  assert.equal(adapter.getSnapshot()[0].elapsed, null)
  assert.equal(adapter.getSnapshot()[0].motion, false)
  assert.equal(clock.size, 0) // Single word and no duration require no clock.
})

test('reduced motion updates live; hidden tabs and hidden process rows release clocks', async t => {
  const { doc, clock, env, adapter } = setup(t)
  const native = addRow(doc)
  await flush()
  env.reduce(true)
  assert.equal(adapter.getSnapshot()[0].motion, false)
  native.item.dataset.turnProcessHidden = 'true'
  await flush()
  assert.equal(clock.size, 0)
  native.item.removeAttribute('data-turn-process-hidden')
  await flush()
  assert.equal(clock.size, 1)
  Object.defineProperty(doc, 'hidden', { configurable: true, value: true })
  doc.dispatchEvent(new env.window.Event('visibilitychange'))
  assert.equal(clock.size, 0)
  Object.defineProperty(doc, 'hidden', { configurable: true, value: false })
  doc.dispatchEvent(new env.window.Event('visibilitychange'))
  assert.equal(clock.size, 1)
})

test('unrecognized native structure remains untouched; unload is idempotent', async t => {
  const { doc, clock, env, adapter } = setup(t)
  addRow(doc, { malformed: true })
  await flush()
  assert.equal(adapter.getSnapshot().length, 0)
  const native = addRow(doc)
  await flush()
  adapter.dispose()
  adapter.dispose()
  assert.equal(clock.size, 0)
  assert.equal(env.mediaListeners.size, 0)
  assert.equal(native.title.hasAttribute('data-rich-thinking-title'), false)
  addRow(doc)
  await flush()
  assert.equal(adapter.getSnapshot().length, 0)
})

test('rapid Markdown DOM replacements cannot starve or recreate the shared clock', async t => {
  const { doc, clock, adapter } = setup(t)
  const native = addRow(doc)
  await flush()
  let updates = 0
  adapter.subscribe(() => updates++)
  for (let i = 0; i < 30; i++) {
    native.body.innerHTML = `<p>chunk ${i}</p>`
    await flush()
  }
  assert.equal(clock.starts, 1)
  assert.equal(updates, 0)
  clock.advance(5000)
  assert.equal(updates, 1)
})
