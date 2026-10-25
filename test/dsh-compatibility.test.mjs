import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const policy = JSON.parse(readFileSync(join(root, 'scripts/dsh-compatibility.json'), 'utf8'))
const boot = resolve(process.env.DSH_APP_BOOT || join(root, 'DeepSeekSecurity/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'))
const { evaluatePluginCompatibility } = await import(pathToFileURL(boot))
for (const [directory, { minimumVersion, legacyVersions }] of Object.entries(policy.plugins)) {
  const manifest = JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8'))
  test(`${manifest.name}: official gate accepts the 0.2 series and preserves legacy support`, () => {
    for (const version of [...legacyVersions, minimumVersion, policy.verifiedRuntime,
      '0.2.1-rc.3', '0.2.1-rc.4', '0.2.1-rc.99', '0.2.1', '0.2.1+build.42',
      '0.2.2-alpha.1', '0.2.2-rc.1', '0.2.2', '0.2.99-rc.1', '0.2.99']) {
      assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version)
    }
  })
  test(`${manifest.name}: official gate rejects below-minimum and next-series versions`, () => {
    const belowMinimum = directory === 'DSHObserver' ? '0.2.1-rc.1' : '0.2.1-beta.1'
    for (const version of ['0.1.9', '0.2.0', belowMinimum, '0.3.0-0', '0.3.0-alpha.1', '0.3.0-rc.1', '0.3.0', '1.0.0']) {
      const issue = evaluatePluginCompatibility(manifest, {}, version)
      assert.ok(issue, `unexpectedly accepts ${version}`)
      assert.equal(issue.exempted, false)
    }
  })
}
