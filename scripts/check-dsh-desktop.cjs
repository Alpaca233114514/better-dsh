// Run with Desktop's Electron, ELECTRON_RUN_AS_NODE=1 and --expose-internals.
// Arguments: <installation resources/app.asar/dsh> <desktop profile> <receipt.json>
const fs = require('node:fs')
const { resolve, join, dirname, relative, isAbsolute } = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const [runtime, profileDir, output] = process.argv.slice(2).map(value => resolve(value))
if (!runtime || !profileDir || !output) throw new Error('Pass runtime directory, profile and receipt path')
const names = ['@better-dsh/deepseek-security', 'dshgit', 'dshkey', 'dsh-rich-thinking', 'dsh-moonseek', 'dsh-token-meter-dashboard']
;(async () => {
  const official = name => pathToFileURL(join(runtime, 'node_modules/@deepseek-ai', name, 'lib/index.js')).href
  const { loadProfileDirectory, createRuntimeResolution, PluginPackages, evaluatePluginCompatibility, getDshRuntimeVersion } = await import(official('dsh-app-boot'))
  assert.equal(getDshRuntimeVersion(), '0.2.1-rc.2')
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
  for (const name of names) {
    const dir = join(profileDir, 'node_modules', name)
    const manifest = JSON.parse(fs.readFileSync(join(dir, 'package.json'), 'utf8'))
    assert.equal(evaluatePluginCompatibility(manifest, {}, '0.2.1-rc.2'), undefined)
    // ESM uses the real importer path for linked plugins; inspect that same path.
    const hostUrl = pathToFileURL(fs.realpathSync(join(dir, manifest.exports['.']))).href
    const host = await import(hostUrl)
    assert.equal(typeof host.apply, 'function')
    const singleton = manifest.peerDependencies['@deepseek-ai/cordis'] ? 'cordis'
      : manifest.peerDependencies['@deepseek-ai/schemastery'] ? 'schemastery' : undefined
    const dependency = singleton && packages.packageOf(`@deepseek-ai/${singleton}`, hostUrl)
    if (singleton) {
      assert.equal(dependency?.version, singleton === 'cordis' ? '4.0.5' : '3.18.5', `${name}: ${singleton} version`)
      const location = relative(runtime, resolve(dependency.dir))
      assert.ok(location && !location.startsWith('..') && !isAbsolute(location), `${name}: ${singleton} must come from Desktop: ${dependency.dir}`)
    }
    results.push({ name, version: manifest.version, host: 'imported-with-official-resolution',
      ...(singleton ? { [singleton]: dependency.version, singleton: 'desktop-owned' } : {}) })
  }
  fs.writeFileSync(output, JSON.stringify({ ok: true, runtime: '0.2.1-rc.2', skippedBundles: [], autoReview: 'preserved', results }, null, 2) + '\n')
})().catch(error => {
  fs.writeFileSync(output, JSON.stringify({ ok: false, error: error.stack }, null, 2) + '\n')
  process.exitCode = 1
})
