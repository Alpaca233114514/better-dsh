import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import * as ReactDOM from 'react-dom'
import { Config, apply } from '../lib/index.js'

test('installable bundle uses DSH client loader with shared React and no host work', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh'], '0.2.0-rc.2 || 0.2.1-alpha.2 || 0.2.1-rc.1 || 0.2.1-rc.2')
  let plugin, id
  const required = []
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(registration) {
      id = registration.id
      plugin = registration.factory(name => {
        required.push(name)
        if (name === 'react') return React
        if (name === 'react-dom') return ReactDOM
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return {}
        throw Error(`unexpected runtime dependency ${name}`)
      })
    } } },
  })
  assert.equal(id, manifest.name)
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual([...new Set(required)].sort(), ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react-dom'])
  const effects = []
  apply({ fiber: 'plugin-fiber', inject(names, fn) {
    assert.deepEqual(names, ['settings'])
    fn({ effect: cb => effects.push(cb()), settings: { configure(options, owner) {
      assert.equal(options.auto, true); assert.equal(owner, 'plugin-fiber'); return () => {}
    } } })
  } })
  assert.equal(effects.length, 1)
})

test('native schema defaults to Chinese and rejects invalid durations/languages', () => {
  // Host schema exposes Volatile leaves; DSH's settings mirror serializes their values.
  const defaults = Config({})
  assert.equal(defaults.language.get(), 'zh')
  assert.equal(defaults.intervalMs.get(), 5000)
  assert.throws(() => Config({ intervalMs: 20 }))
  assert.throws(() => Config({ language: 'mixed' }))
  assert.throws(() => Config({ chineseVerbs: [123] }))
})
