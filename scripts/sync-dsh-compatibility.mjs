import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const policy = JSON.parse(readFileSync(join(root, 'scripts/dsh-compatibility.json'), 'utf8'))
const write = process.argv.includes('--write')
for (const [directory, { minimumVersion, legacyVersions }] of Object.entries(policy.plugins)) {
  const range = [...legacyVersions, `>=${minimumVersion} <${policy.seriesUpperExclusive}`].join(' || ')
  const path = join(root, directory, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(manifest.engines?.dsh, undefined, `${directory}: engines.dsh would override peer checks`)
  const peers = Object.keys(manifest.peerDependencies).filter(name => /^@deepseek-ai\/dsh(?:$|-)/u.test(name))
  assert.ok(peers.length, `${directory}: no DSH compatibility declaration`)
  for (const name of peers) {
    if (write) manifest.peerDependencies[name] = range
    else assert.equal(manifest.peerDependencies[name], range, `${directory}: ${name}`)
  }
  if (write) writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  const lockPath = join(root, directory, 'package-lock.json')
  if (!existsSync(lockPath)) continue
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  if (write) {
    lock.version = manifest.version
    lock.packages[''].version = manifest.version
    lock.packages[''].peerDependencies = manifest.peerDependencies
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
  }
  assert.equal(lock.version, manifest.version, `${directory}: lockfile version`)
  assert.deepEqual(lock.packages[''].peerDependencies, manifest.peerDependencies, `${directory}: lockfile peers`)
}
console.log(`${write ? 'Updated' : 'Checked'} ${Object.keys(policy.plugins).length} plugins for DSH ${policy.verifiedRuntime}`)
