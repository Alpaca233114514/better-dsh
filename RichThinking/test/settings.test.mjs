import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { available, nativeFixture } from '../scripts/native-fixture.mjs'
import { dom, flush } from './helpers.mjs'

test('native settings save atomically, retain rejected edits and respect read-only host', { skip: !await available() }, async () => {
  const out = await nativeFixture()
  const env = dom(), doc = env.window.document
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = env.window; globalThis.document = doc; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { React, createRoot, Settings } = await import(pathToFileURL(join(out, 'fixture.js')).href)
  const host = doc.createElement('div'); doc.body.append(host)
  const root = createRoot(host), listeners = new Set(), calls = []
  let accepted = true
  let state = { status: 'ready', writable: true, revision: 7, value: { language: 'zh', animation: true } }
  const form = { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    async mutate(ops, revision) {
      calls.push({ ops, revision })
      if (accepted) { state = { ...state, revision: state.revision + 1, value: Object.fromEntries(ops.map(op => [op.path[0], op.value])) }; for (const fn of listeners) fn() }
      return accepted
    } }
  const click = async selector => React.act(async () => { host.querySelector(selector).click(); await flush() })
  const submit = async () => React.act(async () => { host.querySelector('form').dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true })); await flush() })
  try {
    await React.act(async () => { root.render(React.createElement(Settings, { form })); await flush() })
    assert.equal(host.querySelector('select').value, 'zh')
    assert.equal(host.querySelectorAll('textarea').length, 2)
    assert.equal(host.querySelector('[type="submit"]').disabled, true)
    await click('[aria-label="文字过渡动画"]')
    await submit()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].revision, 7)
    assert.equal(state.value.animation, false)
    assert.match(host.textContent, /已保存/)
    accepted = false
    await click('[aria-label="显示运行耗时"]')
    await submit()
    assert.match(host.textContent, /未保存/)
    assert.equal(host.querySelector('[aria-label="显示运行耗时"]').getAttribute('aria-checked'), 'false')
    assert.equal(state.value.showElapsed, true)
    await React.act(async () => { state = { ...state, writable: false }; for (const fn of listeners) fn(); await flush() })
    assert.equal(host.querySelector('[type="submit"]').disabled, true)
    assert.equal(host.querySelector('textarea').disabled, true)
  } finally {
    await React.act(async () => root.unmount())
    assert.equal(listeners.size, 0)
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    env.close()
  }
})
