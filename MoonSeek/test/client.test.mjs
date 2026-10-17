import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'

function load() {
  let plugin
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    document: globalThis.document,
    window: { __ModuleLoader__: { load({ id, factory }) {
      assert.equal(id, manifest.name)
      plugin = factory(name => { assert.equal(name, 'react'); return React })
    } } },
  })
  return plugin
}

test('delivered client: names, native writes, external changes, locale and unload', async () => {
  const env = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>')
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: env.window, document: env.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(document.querySelector('main'))
  const events = new Set(), localeEvents = new Set(), cleanup = [], writes = []
  let preference = 'system', active = 'zh-CN', Component, options
  const change = value => { preference = value; for (const fn of events) fn() }
  const plugin = load()
  const ctx = {
    effect(fn) { cleanup.push(fn()) },
    on(name, fn) { assert.equal(name, 'theme/change'); events.add(fn); return () => events.delete(fn) },
    theme: { getTheme: () => ({ preference, active: { id: 'dark' } }), setTheme(mode) { writes.push(mode); change(mode) } },
    locale: { getSnapshot: () => ({ active }), subscribe(fn) { localeEvents.add(fn); return () => localeEvents.delete(fn) } },
    slots: { inject(name, fn) { assert.equal(name, 'settings.general.item'); cleanup.push(fn()) }, register(opts, Comp) {
      options = opts; Component = Comp; return () => { root.render(null) }
    } },
  }
  try {
    await act(async () => { plugin.apply(ctx); root.render(React.createElement(Component)) })
    assert.equal(options.id, 'appearance')
    assert.equal(options.priority, -10)
    assert.equal(options.order, 10)
    const buttons = () => [...document.querySelectorAll('button')]
    assert.deepEqual(buttons().map(b => b.textContent), ['月之亮面', '月之暗面', '跟随系统'])
    assert.deepEqual(buttons().map(b => b.getAttribute('aria-pressed')), ['false', 'false', 'true'])
    assert.deepEqual(writes, [], 'mount must not write or reset the saved preference')
    assert.equal(document.querySelectorAll('style[data-moonseek-style]').length, 1)
    assert.equal(document.querySelectorAll('svg[aria-hidden="true"]').length, 3)
    for (const [i, mode] of ['light', 'dark', 'system'].entries()) {
      await act(async () => { buttons()[i].click() })
      assert.equal(writes.at(-1), mode)
      assert.equal(buttons()[i].getAttribute('aria-pressed'), 'true')
      assert.equal(buttons().filter(b => b.getAttribute('aria-pressed') === 'true').length, 1)
    }
    await act(async () => { change('light') })
    assert.equal(buttons()[0].getAttribute('aria-pressed'), 'true')
    await act(async () => { active = 'en'; for (const fn of localeEvents) fn() })
    assert.deepEqual(buttons().map(b => b.textContent), ['Moonlit Side', 'Dark Side of the Moon', 'Follow System'])
    assert.equal(document.querySelector('[role="group"]').getAttribute('aria-label'), 'Appearance')
    await act(async () => { for (const dispose of cleanup.splice(0).reverse()) dispose?.() })
    assert.equal(document.querySelector('[data-moonseek-style]'), null)
    assert.equal(events.size + localeEvents.size, 0)
    assert.equal(preference, 'light', 'unload must preserve the saved preference')
    await act(async () => { plugin.apply(ctx); root.render(React.createElement(Component)) })
    assert.equal(document.querySelectorAll('[data-moonseek-appearance]').length, 1)
    assert.equal(buttons()[0].getAttribute('aria-pressed'), 'true')
  } finally {
    await act(async () => { for (const dispose of cleanup.reverse()) dispose?.(); root.unmount() })
    Object.assign(globalThis, { window: before.window, document: before.document, IS_REACT_ACT_ENVIRONMENT: before.act })
    env.window.close()
  }
})
