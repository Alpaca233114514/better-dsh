import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, unlink, rename } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { build } from 'esbuild'
await mkdir('.test-build', { recursive: true })
await build({ entryPoints: ['src/cache.ts'], outfile: '.test-build/cache.mjs', bundle: true, platform: 'node', format: 'esm' })
await build({ entryPoints: ['src/watch.ts'], outfile: '.test-build/watch.mjs', bundle: true, platform: 'node', format: 'esm' })
const { RepositoryCache } = await import('../.test-build/cache.mjs')
const { RepositoryWatches } = await import('../.test-build/watch.mjs')
const { GitRepository } = await import('../src/git.ts')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const run = (program, args, cwd, input, allowed = [0]) => new Promise((yes, no) => {
  const child = execFile(program, args, { cwd, windowsHide: true, encoding: 'utf8', env: { ...process.env,
    GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
    if (error && !allowed.includes(error.code)) no(new Error(stderr || error.message)); else yes(stdout)
  })
  child.stdin.end(input)
})
async function fixture(native = false) {
  const root = await mkdtemp(resolve('../.cache/dshgit-incremental-'))
  await run('git', ['init', '-b', 'codex/cache'], root)
  for (const [key, value] of [['user.name', 'Cache Test'], ['user.email', 'cache@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false'], ['core.hooksPath', join(root, 'empty-hooks')]]) await run('git', ['config', key, value], root)
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'a.txt'), 'before\n')
  await writeFile(join(root, 'nested', 'b.txt'), 'before\n')
  await writeFile(join(root, '.gitignore'), 'ignored/\nnew-ignored/\n')
  await run('git', ['add', '.'], root); await run('git', ['commit', '-m', 'fixture'], root)
  await mkdir(join(root, 'ignored')); await writeFile(join(root, 'ignored', 'log'), 'existing')
  const calls = []
  const repo = new GitRepository((...args) => { calls.push(args); return run(...args) })
  const controller = new AbortController()
  const watches = native ? new RepositoryWatches() : { async *follow(_paths, signal) {
    yield null
    if (!signal.aborted) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  } }
  const cache = new RepositoryCache(repo, [root, join(root, '.git')], watches, controller.signal, () => {})
  await cache.ready
  return { root, repo, cache, calls, close: () => controller.abort() }
}
const equivalent = async f => {
  const cached = await f.cache.read(), actual = await new GitRepository(run).state(f.root, true)
  const sort = state => ({ ...state, files: [...state.files].sort((a, b) => a.path.localeCompare(b.path)) })
  assert.deepEqual(sort(cached), sort(actual))
}

test('a pending PR query does not block local status or queued branch reads', async () => {
  const f = await fixture()
  const started = Promise.withResolvers(), response = Promise.withResolvers()
  const pending = f.cache.execute({ action: 'prInfo' }, { execute() { started.resolve(); return response.promise } })
  try {
    await started.promise
    const local = Promise.all([f.cache.read(), f.cache.execute({ action: 'branches' })])
    assert.equal(await Promise.race([local.then(() => true), pause(1500).then(() => false)]), true)
  } finally { response.resolve({ pr: null }); await pending; f.close() }
})

test('ordinary edits use three path-limited commands; unchanged cache reads use zero', async () => {
  const f = await fixture()
  try {
    const initial = f.calls.length
    for (let i = 0; i < 100; i++) await f.cache.read()
    assert.equal(f.calls.length, initial)
    await writeFile(join(f.root, 'a.txt'), 'after\nmore\n')
    await f.cache.refresh(['a.txt'])
    const delta = f.calls.slice(initial)
    assert.equal(delta.length, 3)
    assert.ok(delta.every(([, args]) => args.at(-2) === '--' && args.at(-1) === 'a.txt'))
    await equivalent(f)
    await writeFile(join(f.root, 'nested', 'b.txt'), 'other\n')
    await f.cache.refresh(['nested/b.txt'])
    await equivalent(f)
    assert.equal((await f.cache.read()).files.length, 2)
    await writeFile(join(f.root, 'a.txt'), 'before\n')
    await f.cache.refresh(['a.txt'])
    assert.equal((await f.cache.read()).files.length, 1)
    await equivalent(f)
  } finally { f.close() }
})

test('new files, deletion, directory rename and metadata invalidation match full Git state', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, 'new name.txt'), 'new\n')
    await f.cache.refresh(['new name.txt']); await equivalent(f)
    await unlink(join(f.root, 'new name.txt'))
    await f.cache.refresh(['new name.txt']); await equivalent(f)
    await rename(join(f.root, 'nested'), join(f.root, 'renamed'))
    await f.cache.refresh(['nested', 'renamed']); await equivalent(f)
    await run('git', ['add', '--all'], f.root)
    await f.cache.refresh(null); await equivalent(f)
    await writeFile(join(f.root, 'renamed', 'b.txt'), 'renamed edit\n')
    await f.cache.refresh(['renamed/b.txt']); await equivalent(f)
    await run('git', ['switch', '-c', 'codex/next'], f.root)
    await f.cache.refresh(null)
    assert.equal((await f.cache.read()).branch, 'codex/next')
    await equivalent(f)
  } finally { f.close() }
})

test('ignored logs do not scan Git; newly created ignored directories are learned once', async () => {
  const f = await fixture()
  try {
    const initial = f.calls.length
    await writeFile(join(f.root, 'ignored', 'log'), 'changed')
    await f.cache.refresh(['ignored/log'])
    assert.equal(f.calls.length, initial)
    await mkdir(join(f.root, 'new-ignored')); await writeFile(join(f.root, 'new-ignored', 'log'), 'new')
    await f.cache.refresh(['new-ignored/log'])
    assert.equal(f.calls.length, initial + 1)
    assert.ok(f.calls.at(-1)[1].includes('check-ignore'))
    await f.cache.refresh(['new-ignored/log'])
    assert.equal(f.calls.length, initial + 1)
    await writeFile(join(f.root, '.gitignore'), '')
    await f.cache.refresh(['.gitignore']); await equivalent(f)
    assert.ok((await f.cache.read()).files.some(file => file.path === 'ignored/log'))
  } finally { f.close() }
})

test('native watcher updates a nested file and does not scan again while idle', async () => {
  const f = await fixture(true)
  try {
    await pause(600)
    const initial = f.calls.length
    await writeFile(join(f.root, 'nested', 'b.txt'), 'native change\n')
    const deadline = Date.now() + 10000
    while (Date.now() < deadline && !(await f.cache.read()).files.some(file => file.path === 'nested/b.txt')) await pause(100)
    assert.ok((await f.cache.read()).files.some(file => file.path === 'nested/b.txt'))
    const delta = f.calls.slice(initial)
    assert.equal(delta.length, 3)
    assert.ok(delta.every(([, args]) => args.at(-1) === 'nested/b.txt'))
    await pause(800)
    assert.equal(f.calls.length, initial + 3)
    await equivalent(f)
    await run('git', ['add', 'nested/b.txt'], f.root)
    const indexDeadline = Date.now() + 10000
    while (Date.now() < indexDeadline && !(await f.cache.read()).files.some(file => file.index === 'M')) await pause(100)
    assert.ok((await f.cache.read()).files.some(file => file.index === 'M'))
    await equivalent(f)
  } finally { f.close() }
})
