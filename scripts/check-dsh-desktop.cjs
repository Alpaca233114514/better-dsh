// Run with Desktop's Electron, ELECTRON_RUN_AS_NODE=1 and --expose-internals.
// Arguments: <installation resources/app.asar/dsh> <desktop profile> <receipt.json>
const fs = require('node:fs')
const { resolve, join, dirname, relative, isAbsolute } = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const [runtime, profileDir, output] = process.argv.slice(2).map(value => resolve(value))
if (!runtime || !profileDir || !output) throw new Error('Pass runtime directory, profile and receipt path')
const root = resolve(__dirname, '..')
const policy = JSON.parse(fs.readFileSync(join(root, 'scripts/dsh-compatibility.json'), 'utf8'))
const manifests = Object.keys(policy.plugins).map(dir => JSON.parse(fs.readFileSync(join(root, dir, 'package.json'), 'utf8')))
;(async () => {
  const official = name => pathToFileURL(join(runtime, 'node_modules/@deepseek-ai', name, 'lib/index.js')).href
  const { loadProfileDirectory, createRuntimeResolution, PluginPackages, evaluatePluginCompatibility, getDshRuntimeVersion } = await import(official('dsh-app-boot'))
  const runtimeVersion = getDshRuntimeVersion()
  const { Context } = await import(official('cordis'))
  const installAnchor = join(runtime, 'node_modules/@deepseek-ai/dsh/package.json')
  const profile = loadProfileDirectory('dsh', profileDir, installAnchor)
  assert.deepEqual(profile.skippedBundles, [])
  assert.ok(profile.layers.some(layer => layer.packageName === '@deepseek-ai/dsh-experimental-auto-review'))
  const resolution = await createRuntimeResolution({ installAnchor, profile, home: dirname(dirname(profileDir)) })
  const ctx = new Context()
  // Use the same official interception as the actual Desktop launcher.
  const packages = new PluginPackages(ctx, { resolution })
  const results = []
  for (const source of manifests) {
    const name = source.name
    const dir = join(profileDir, 'node_modules', name)
    const manifest = JSON.parse(fs.readFileSync(join(dir, 'package.json'), 'utf8'))
    assert.equal(evaluatePluginCompatibility(manifest, {}, runtimeVersion), undefined)
    assert.equal(manifest.version, source.version, `${name}: installed version`)
    // ESM uses the real importer path for linked plugins; inspect that same path.
    const hostUrl = pathToFileURL(fs.realpathSync(join(dir, manifest.exports['.']))).href
    const host = await import(hostUrl)
    assert.equal(typeof host.apply, 'function')
    const singleton = manifest.peerDependencies['@deepseek-ai/cordis'] ? 'cordis'
      : manifest.peerDependencies['@deepseek-ai/schemastery'] ? 'schemastery' : undefined
    const dependency = singleton && packages.packageOf(`@deepseek-ai/${singleton}`, hostUrl)
    if (singleton) {
      const officialManifest = JSON.parse(fs.readFileSync(join(runtime, 'node_modules/@deepseek-ai', singleton, 'package.json'), 'utf8'))
      assert.equal(dependency?.version, officialManifest.version, `${name}: ${singleton} version`)
      const location = relative(runtime, resolve(dependency.dir))
      assert.ok(location && !location.startsWith('..') && !isAbsolute(location), `${name}: ${singleton} must come from Desktop: ${dependency.dir}`)
    }
    let client = 'not-provided'
    if (manifest.exports['./client']) {
      let registration
      vm.runInNewContext(fs.readFileSync(join(dir, manifest.exports['./client']), 'utf8'), {
        window: { __ModuleLoader__: { load(value) { assert.equal(registration, undefined); registration = value } } },
      })
      assert.equal(registration?.id, name)
      assert.equal(typeof registration.factory, 'function')
      client = 'factory-registered'
    }
    results.push({ name, version: manifest.version, client, host: 'imported-with-official-resolution',
      ...(singleton ? { [singleton]: dependency.version, singleton: 'desktop-owned' } : {}) })
  }
  fs.writeFileSync(output, JSON.stringify({ ok: true, runtime: runtimeVersion, skippedBundles: [], autoReview: 'preserved', results }, null, 2) + '\n')
})().catch(error => {
  fs.writeFileSync(output, JSON.stringify({ ok: false, error: error.stack }, null, 2) + '\n')
  process.exitCode = 1
})
