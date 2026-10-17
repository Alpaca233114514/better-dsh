import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { access, mkdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../', import.meta.url))
const upstream = resolve(process.env.DSH_SOURCE || join(root, '../.cache/dsh-upstream-20261012'))
let available = true
try { await access(join(upstream, 'packages/client/ui-slots/src/index.ts')) } catch { available = false }

test('delivered plugin stays inside real DSH GeneralSection, preserving adjacent settings and restoring appearance', {
  skip: !available && 'Set DSH_SOURCE to an installed DSH source checkout',
}, async () => {
  const out = join(root, '.cache/native.js')
  await mkdir(join(root, '.cache'), { recursive: true })
  const sourcePath = path => JSON.stringify(join(upstream, path).replaceAll('\\', '/'))
  await build({ stdin: { contents: `
    export { SlotCore } from ${sourcePath('packages/client/ui-slots/src/index.ts')};
    export { GeneralSection } from ${sourcePath('packages/client/ui-settings-general/src/client/GeneralSection.tsx')};
  `, resolveDir: root, loader: 'tsx' }, jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    outfile: out, bundle: true, format: 'esm', platform: 'node' })
  const { SlotCore, GeneralSection } = await import(pathToFileURL(out).href)
  const core = new SlotCore()
  core.register({ name: 'root', children: { 'settings.general.item': { kind: 'list', scope: 'root' } } }, () => null)
  const Native = () => React.createElement('div', { 'data-native-appearance': '' }, '浅色 / 深色')
  const Fonts = () => React.createElement('div', { 'data-font-size': '' }, '字号大小')
  const Language = () => React.createElement('div', { 'data-language': '' }, '语言')
  core.register({ name: 'settings.general.item', id: 'language', order: 5 }, Language)
  core.register({ name: 'settings.general.item', id: 'appearance', order: 10 }, Native)
  core.register({ name: 'settings.general.item', id: 'font-size', order: 11 }, Fonts)
  let plugin, dispose
  vm.runInNewContext(await readFile(join(root, 'lib/client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load({ factory }) { plugin = factory(name => {
      assert.equal(name, 'react'); return React
    }) } } },
  })
  plugin.apply({
    effect() {}, // SSR: no DOM stylesheet installation or subscriptions.
    on() { return () => {} },
    theme: { getTheme: () => ({ preference: 'system' }), setTheme() {} },
    locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
    slots: {
      inject(name, fn) { assert.equal(name, 'settings.general.item'); fn() },
      register(options, Component) { dispose = core.register(options, Component); return dispose },
    },
  })
  assert.equal(core.entries('settings.general.item').length, 4)
  const winners = () => core.entriesOfSlot('settings.general.item')
  assert.equal(winners().length, 3)
  const section = () => renderToStaticMarkup(React.createElement(GeneralSection, {
    renderSlot(name) {
      assert.equal(name, 'settings.general.item')
      return core.entriesOfSlot(name).slice().sort((a, b) => a.options.order - b.options.order)
        .map(entry => React.createElement(entry.component, { key: entry.options.id }))
    },
  }))
  const env = new JSDOM(section())
  try {
    const doc = env.window.document
    assert.equal(doc.querySelectorAll('[data-moonseek-appearance]').length, 1)
    assert.equal(doc.querySelectorAll('[data-native-appearance]').length, 0)
    assert.equal(doc.querySelector('[data-moonseek-appearance]').previousElementSibling.dataset.language, '')
    assert.equal(doc.querySelector('[data-moonseek-appearance]').nextElementSibling.dataset.fontSize, '')
    assert.equal(doc.querySelectorAll('h1, nav, [role="dialog"]').length, 0, 'the plugin must not add a settings shell or navigation')
    assert.match(doc.body.textContent, /语言外观月之亮面月之暗面跟随系统字号大小/)
  } finally { env.window.close() }
  assert.equal(winners().find(e => e.options.id === 'font-size').component, Fonts)
  dispose()
  assert.equal(winners().find(e => e.options.id === 'appearance').component, Native)
  assert.equal(winners().find(e => e.options.id === 'font-size').component, Fonts)
  assert.match(section(), /浅色 \/ 深色/)
})
