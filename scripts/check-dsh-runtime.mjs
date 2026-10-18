// Usage: node scripts/check-dsh-runtime.mjs <runtime node_modules> [desktop profile]
// Read-only: use the official compatibility evaluator and the runtime's peers.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (!process.argv[2]) throw new Error('Pass the target DSH runtime node_modules directory')
const modules = resolve(process.argv[2])
const runtimeParent = pathToFileURL(join(modules, '..', 'runtime-check.mjs')).href
registerHooks({ resolve(specifier, context, next) {
  return next(specifier, specifier.startsWith('@deepseek-ai/')
    ? { ...context, parentURL: runtimeParent } : context)
} })
const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import('@deepseek-ai/dsh-app-boot')
const version = getDshRuntimeVersion()
assert.equal(version, '0.2.1-rc.2', 'This compatibility receipt targets rc.2')
const directories = ['DeepSeekSecurity', 'DSHGit', 'DSHKey', 'RichThinking', 'MoonSeek', 'TokenMeter']
const results = []
for (const directory of directories) {
  const sourceManifest = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8'))
  const base = process.argv[3]
    ? resolve(process.argv[3], 'node_modules', sourceManifest.name) : join(root, directory)
  const manifest = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'))
  // No version exemptions: the manifest must satisfy the official gate itself.
  assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, manifest.name)
  assert.equal(manifest.version, sourceManifest.version, 'Installed release differs from source')
  const host = await import(pathToFileURL(resolve(base, manifest.exports['.'])))
  assert.equal(typeof host.apply, 'function', `${manifest.name}: Host entry`)
  let registered
  vm.runInNewContext(await readFile(resolve(base, manifest.exports['./client']), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { assert.equal(registered, undefined); registered = value } } },
  }, { filename: `${manifest.name}/client.js` })
  assert.equal(registered?.id, manifest.name)
  assert.equal(typeof registered.factory, 'function')
  results.push({ name: manifest.name, version: manifest.version, compatibility: 'passed', host: 'imported', client: 'factory-registered' })
}
console.log(JSON.stringify({ runtime: version, results }, null, 2))
