import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { available, nativeFixture } from '../scripts/native-fixture.mjs'
import { dom, flush } from './helpers.mjs'

const hasSource = await available()
test('real upstream ReasoningRow: portal, disclosure, stream, reduced motion and disposal', { skip: !hasSource && 'Set DSH_SOURCE to the audited DSH checkout' }, async () => {
  const out = await nativeFixture()
  const env = dom(), doc = env.window.document
  const saved = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = env.window
  globalThis.document = doc
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { React, createRoot, NativeRow, apply, bodySelector } = await import(pathToFileURL(join(out, 'fixture.js')).href)
  const { act } = React
  const host = doc.createElement('div'), controller = doc.createElement('div')
  doc.body.append(host, controller)
  const root = createRoot(host), overlay = createRoot(controller)
  const effects = [], configListeners = new Set(), localeListeners = new Set()
  let config = { status: 'ready', value: { language: 'zh', vocabularyMode: 'replace', chineseVerbs: ['叽里呱啦中'], showElapsed: false } }
  try {
    await act(async () => {
      root.render(React.createElement(NativeRow))
      await flush()
    })
    const row = host.querySelector('[data-variant="think"]')
    const button = row.querySelector('[data-disclosure-row]')
    await act(async () => {
      apply({ effect: fn => effects.push(fn()),
        configForms: { get: id => {
          assert.equal(id, 'rich-thinking')
          return { getSnapshot: () => config, subscribe: fn => { configListeners.add(fn); return () => configListeners.delete(fn) } }
        } },
        locale: { getSnapshot: () => ({ active: 'en' }), subscribe: fn => { localeListeners.add(fn); return () => localeListeners.delete(fn) } },
        slots: { inject: (name, fn) => { assert.ok(['shell.overlay', 'plugins.bundle.config'].includes(name)); fn() }, register: (_options, Component) => {
          if (_options.name === 'shell.overlay') overlay.render(React.createElement(Component)); return () => {}
        } },
      })
      await flush()
    })
    assert.equal(row.querySelector('[data-rich-thinking-word]').textContent, '叽里呱啦中…')
    assert.equal(button.getAttribute('aria-expanded'), 'false')
    assert.equal(row.querySelector('[data-rich-thinking-host]').getAttribute('aria-hidden'), 'true')
    assert.equal(row.querySelector('[data-rich-thinking-title]').textContent, '思考')
    // Real DisclosureRow's handler, not our fixture, processes the key.
    await act(async () => { button.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush() })
    assert.equal(button.getAttribute('aria-expanded'), 'true')
    assert.equal(row.querySelector(bodySelector).textContent, '**Actual model text**\n\nMore reasoning.')
    const expandedBody = row.querySelector(bodySelector)
    await act(async () => {
      root.render(React.createElement(NativeRow, { text: 'Unmodified live Markdown **delta**' }))
      await flush()
    })
    assert.equal(row.querySelector(bodySelector), expandedBody)
    assert.equal(expandedBody.textContent, 'Unmodified live Markdown **delta**')
    assert.equal(button.getAttribute('aria-expanded'), 'true')
    await act(async () => { env.reduce(true); await flush() })
    assert.equal(row.querySelector('[data-rich-thinking-label]').dataset.motion, 'off')
    // Native completion rerenders the same row, restoring native title immediately.
    await act(async () => { root.render(React.createElement(NativeRow, { running: false })); await flush() })
    assert.equal(host.querySelector('[data-variant="think"]'), row)
    assert.equal(row.querySelector('[data-rich-thinking-host]'), null)
    assert.equal(button.getAttribute('aria-expanded'), 'true')
    await act(async () => { root.render(React.createElement(NativeRow)); await flush() })
    assert.ok(row.querySelector('[data-rich-thinking-host]'))
    await act(async () => {
      config = { status: 'ready', value: { enabled: false } }
      for (const fn of configListeners) fn()
      await flush()
    })
    assert.equal(row.querySelector('[data-rich-thinking-host]'), null)
    await act(async () => { for (const dispose of effects.reverse()) dispose(); overlay.unmount(); await flush() })
    assert.equal(doc.querySelector('[data-rich-thinking-style]'), null)
    assert.equal(configListeners.size + localeListeners.size, 0)
  } finally {
    await act(async () => { root.unmount() })
    globalThis.window = saved.window
    globalThis.document = saved.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
    env.close()
  }
})

test('real upstream event projection: reasoning, tools, answer, retry, cancellation and replay', { skip: !hasSource && 'Set DSH_SOURCE to the audited DSH checkout' }, async () => {
  const out = await nativeFixture()
  const { assistantDefinition: definition } = await import(pathToFileURL(join(out, 'fixture.js')).href)
  const pipeline = () => {
    let seq = 1
    const location = { kind: 'step', step: { status: 'open', data: new Map() }, turn: { status: 'open' } }
    const start = { location, event: { type: 'step/start', seq, time: 1000, data: { turn: 1, step: 1 } } }
    const context = { start, matches: [start], state: definition.start({}, start) }
    return {
      context, location,
      push(type, data) {
        const match = { location, event: { type, seq: ++seq, time: seq * 1000, surfaceOp: 'append', data: { turn: 1, step: 1, ...data } } }
        context.state = definition.update(context, match)
        context.matches.push(match)
      },
      chunk(chunk) { this.push('assistant/live-chunk', { chunk }) },
      read() { return definition.buildLocationData(context, 'step')?.value },
    }
  }
  const run = pipeline()
  assert.equal(run.read().blocks.length, 0)
  run.chunk({ type: 'reasoning-delta', index: 0, text: 'Actual reasoning' })
  assert.equal(run.read().status, 'running')
  assert.deepEqual(run.read().blocks, [{ kind: 'reasoning', text: 'Actual reasoning' }])
  run.chunk({ type: 'reasoning-delta', index: 0, text: ' continues' })
  assert.equal(run.read().blocks[0].text, 'Actual reasoning continues')
  run.chunk({ type: 'tool-call-delta', index: 1, id: 'read-1', name: 'read_file', argumentsDelta: '{}' })
  assert.equal(run.read().blocks.at(-1).kind, 'tool-call') // AssistantMarkdown stops the preceding reasoning row.
  run.push('assistant/message', { message: { id: 'a1', content: [{ type: 'reasoning', text: 'Actual reasoning continues' }] } })
  assert.equal(run.read().status, 'settled')
  const replay = definition.buildLocationData({ ...run.context, state: undefined }, 'step').value
  assert.equal(replay.status, 'settled')
  assert.deepEqual(replay.blocks, run.read().blocks)
  const retry = pipeline()
  retry.chunk({ type: 'reasoning-delta', index: 0, text: 'Partial thought' })
  retry.push('llm/retry', {})
  assert.equal(retry.read().blocks.length, 0)
  retry.chunk({ type: 'reasoning-delta', index: 0, text: 'New attempt' })
  assert.deepEqual(retry.read().blocks, [{ kind: 'reasoning', text: 'New attempt' }])
  retry.chunk({ type: 'text-delta', index: 1, text: 'Actual answer' })
  assert.equal(retry.read().blocks.at(-1).kind, 'text')
  for (const reason of ['aborted', 'error']) {
    const interrupted = pipeline()
    interrupted.chunk({ type: 'reasoning-delta', index: 0, text: 'Keep this partial text' })
    interrupted.location.turn.status = 'closed'
    interrupted.location.turn.end = { seq: 99, time: 9000, data: { reason: { kind: reason } } }
    assert.equal(interrupted.read().status, 'interrupted')
    assert.equal(interrupted.read().blocks[0].text, 'Keep this partial text')
  }
})
