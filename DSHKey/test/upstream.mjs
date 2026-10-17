// Optional contract check against an independently obtained official DSH source/runtime.
// Usage: node test/upstream.mjs <DSH source directory> <DSH runtime node_modules>
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from './loader.mjs'
const [sourceArg, modulesArg] = process.argv.slice(2)
if (!sourceArg || !modulesArg) throw new Error('Pass official DSH source directory and runtime node_modules')
const source = resolve(sourceArg), modules = resolve(modulesArg)
const result = await build({ stdin: { contents: `export { ShortcutRegistry } from ${JSON.stringify(join(source, 'packages/client/shortcuts/src/client/registry.ts'))}; export * from ${JSON.stringify(join(source, 'packages/client/shortcuts/src/protocol.ts'))};`, resolveDir: source, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24', tsconfigRaw: {}, nodePaths: [modules, fileURLToPath(new URL('../node_modules', import.meta.url))],
  alias: { '@deepseek-ai/dsh-util-values': join(source, 'packages/util/values/src/index.ts'), '@deepseek-ai/dsh-util-crypto': join(source, 'packages/util/crypto/src/index.ts') } })
const official = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const { actions, defaultBindings } = await load('../src/actions.ts')
const gesture = { code: 'KeyL', control: true, alt: true, shift: true, meta: false, repeat: false, composing: false, defaultPrevented: false }
let checks = 0
for (const runtime of ['web', 'desktop']) for (const platform of ['windows', 'macos', 'linux']) {
  const registry = new official.ShortcutRegistry(runtime, platform)
  let fired = 0
  for (const action of actions) registry.register({ id: action.id, label: () => action.label, aliases: [], defaults: defaultBindings(action.code), regions: ['page', 'editable'], modals: [], resolve: () => ({ status: 'handled', run: () => fired++ }) })
  assert.equal(registry.catalog.getSnapshot().length, 9)
  assert.ok(registry.catalog.getSnapshot().every(row => row.issue === null && row.conflicts.length === 0))
  const nativeGesture = { ...gesture, control: platform !== 'macos', meta: platform === 'macos' }
  registry.dispatch(nativeGesture, { region: 'editable', modal: null, target: null }, () => {})
  assert.equal(fired, platform === 'linux' ? 0 : 1)
  registry.dispatch({ ...nativeGesture, repeat: true }, { region: 'editable', modal: null, target: null }, () => {})
  registry.dispatch({ ...nativeGesture, composing: true }, { region: 'editable', modal: null, target: null }, () => {})
  assert.equal(fired, platform === 'linux' ? 0 : 1)
  let raw = null, failWrite = false
  const storage = { read: () => raw, write: next => { if (failWrite) throw new Error('denied'); raw = next } }
  const persistence = new official.ShortcutPersistence(storage, runtime, platform, true, snapshot => registry.configure(snapshot))
  persistence.setDefinitions(registry.definitions())
  let snapshot = await persistence.readCurrent()
  if (platform !== 'linux') {
    const conflict = await persistence.edit({ type: 'set', id: 'dshkey.focusInput', binding: defaultBindings('KeyC')[`${runtime}:${platform}`] }, snapshot.revision)
    assert.equal(conflict.status, 'conflict'); assert.equal(raw, null)
    const saved = await persistence.edit({ type: 'set', id: 'dshkey.focusInput', binding: { code: 'KeyM', modifiers: ['primary', 'alt', 'shift'] } }, snapshot.revision)
    assert.equal(saved.status, 'saved')
    assert.equal((await persistence.edit({ type: 'set', id: 'dshkey.focusInput', binding: null }, snapshot.revision)).status, 'stale')
    failWrite = true
    assert.equal((await persistence.edit({ type: 'set', id: 'dshkey.focusInput', binding: null }, saved.snapshot.revision)).status, 'write-failed')
    assert.equal(registry.catalog.getSnapshot().find(row => row.id === 'dshkey.focusInput').binding.code, 'KeyM')
    failWrite = false
    const restart = new official.ShortcutPersistence(storage, runtime, platform, true, () => {})
    restart.setDefinitions(registry.definitions())
    snapshot = await restart.readCurrent()
    assert.equal(snapshot.document.profiles[`${runtime}:${platform}`]['dshkey.focusInput'].code, 'KeyM')
    const reset = await restart.edit({ type: 'reset', id: 'dshkey.focusInput' }, snapshot.revision)
    assert.equal(reset.status, 'saved')
    restart.dispose()
  }
  persistence.dispose(); checks++
}
console.log(`PASS: ${checks} official runtime/platform profiles; registration, dispatch, IME/repeat, conflicts, stale writes, failure retention, reload and reset.`)
