import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('profile installs are idempotent and uninstall preserves other consumers and the source', () => {
  const home = mkdtempSync(join(tmpdir(), 'next-suggestion-install-'))
  const env = { ...process.env, DSH_HOME: home, DSH_PROFILE: 'desktop', DSH_PLUGINS_DIR: join(home, 'plugins') }
  function run(script, args = [], success = true) {
    const result = spawnSync('bash', [script, ...args], { env, encoding: 'utf8' })
    assert.equal(result.status === 0, success, result.stderr + result.stdout)
  }
  const readPackage = profile => JSON.parse(readFileSync(join(home, 'profiles', profile, 'package.json')))
  const target = join(home, 'plugins/dsh-next-suggestion')
  try {
    for (const profile of ['desktop', 'web']) {
      mkdirSync(join(home, 'profiles', profile), { recursive: true })
      writeFileSync(join(home, 'profiles', profile, 'package.json'), JSON.stringify({ name: profile, dependencies: { other: '1' }, dsh: { profile: { bundles: ['other'] } } }))
      run(join(repo, 'install.sh'), ['--profile', profile])
      run(join(repo, 'install.sh'), ['--profile', profile])
      assert.deepEqual(readPackage(profile).dsh.profile.bundles, ['other', 'dsh-next-suggestion'])
      assert.equal(realpathSync(join(home, 'profiles', profile, 'node_modules/dsh-next-suggestion')), realpathSync(target))
    }
    run(join(repo, 'uninstall.sh'), ['--profile', 'web'])
    assert.ok(existsSync(join(target, 'index.js')))
    assert.ok(existsSync(join(home, 'profiles/desktop/node_modules/dsh-next-suggestion/index.js')))
    assert.deepEqual(readPackage('web').dependencies, { other: '1' })
    run(join(repo, 'uninstall.sh'), ['--profile', 'desktop'])
    assert.equal(existsSync(target), false)
    assert.ok(existsSync(join(repo, 'index.js')))
    run(join(repo, 'uninstall.sh')) // repeat is harmless
    run(join(repo, 'install.sh'), ['--profile', '../escape'], false)
    run(join(repo, 'uninstall.sh'), ['--profile', ''], false)

    run(join(repo, 'install.sh'))
    run(join(target, 'uninstall.sh')) // running from the installed source never deletes itself
    assert.ok(existsSync(join(target, 'index.js')))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})


test('installation copies runtime files without distributing workspace secrets or notes', () => {
  const temp = mkdtempSync(join(tmpdir(), 'next-suggestion-package-'))
  const source = join(temp, 'source')
  const home = join(temp, 'home')
  mkdirSync(source)
  try {
    for (const path of ['package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE', 'install.sh', 'uninstall.sh', 'lib', 'locale', 'docs']) {
      cpSync(join(repo, path), join(source, path), { recursive: true })
    }
    writeFileSync(join(source, '.env'), 'INSTALL_TEST_SENTINEL=private')
    writeFileSync(join(source, 'private.key'), 'test-only key placeholder')
    mkdirSync(join(source, '.workbuddy'))
    writeFileSync(join(source, '.workbuddy', 'note.md'), 'private workspace note')
    mkdirSync(join(source, 'node_modules'))
    writeFileSync(join(source, 'node_modules', 'local-data'), 'private')
    mkdirSync(join(home, 'profiles', 'desktop'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'desktop', 'package.json'), '{}')
    const result = spawnSync('bash', [join(source, 'install.sh')], {
      env: { ...process.env, DSH_HOME: home, DSH_PROFILE: 'desktop', DSH_PLUGINS_DIR: join(home, 'plugins') },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    const target = join(home, 'plugins', 'dsh-next-suggestion')
    for (const path of ['.env', 'private.key', '.workbuddy', 'node_modules']) assert.equal(existsSync(join(target, path)), false, path)
    for (const path of ['index.js', 'lib/prediction.js', 'locale/zh.json', 'uninstall.sh']) assert.ok(existsSync(join(target, path)), path)
    assert.ok(existsSync(join(source, '.env')), 'the source must stay intact')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
