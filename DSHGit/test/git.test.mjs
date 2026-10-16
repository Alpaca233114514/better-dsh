import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { GitRepository, parseStatus, numstat } from '../src/git.ts'
const exec = promisify(execFile)
const cache = resolve('../.cache')
await mkdir(cache, { recursive: true })
const run = async (program, args, cwd, input, allowed = [0]) => new Promise((yes, no) => {
  const child = execFile(program, args, { cwd, windowsHide: true, encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1', GIT_CONFIG_NOSYSTEM: '1' } }, (error, out, stderr) => {
    if (error && !allowed.includes(error.code)) no(new Error(stderr || error.message))
    else yes(out)
  })
  if (input !== undefined) child.stdin.end(input)
  else child.stdin.end()
})
async function fixture({ unborn = false } = {}) {
  const root = await mkdtemp(join(cache, 'dshgit-test-'))
  await run('git', ['init', '-b', 'main'], root)
  await run('git', ['config', 'user.name', 'DSHGit Test'], root)
  await run('git', ['config', 'user.email', 'test@example.invalid'], root)
  await run('git', ['config', 'commit.gpgsign', 'false'], root)
  await run('git', ['config', 'core.autocrlf', 'false'], root)
  await run('git', ['config', 'core.hooksPath', join(root, 'empty-hooks')], root)
  if (!unborn) {
    await writeFile(join(root, 'file.txt'), 'before\n')
    await run('git', ['add', '.'], root)
    await run('git', ['commit', '-m', 'fixture'], root)
  }
  await run('git', ['switch', '-c', 'codex/test'], root)
  return { root, repo: new GitRepository(run), request: action => ({ sessionId: 'test', action }) }
}
test('NUL status and rename stats preserve spaces, tabs and Unicode paths', () => {
  assert.deepEqual(parseStatus('R  新 文件\t.ts\0旧 文件.ts\0?? line\nname\0'), [
    { path: '新 文件\t.ts', original: '旧 文件.ts', index: 'R', worktree: ' ' },
    { path: 'line\nname', index: '?', worktree: '?' },
  ])
  assert.deepEqual(numstat('2\t3\t\0old\0new\0-\t-\tbinary\0'), { additions: 2, deletions: 3 })
})
test('real status, stage, diff, staged-only commit and automatic message', async () => {
  const { root, repo, request } = await fixture()
  await writeFile(join(root, 'file.txt'), 'after\nsecond\n')
  await writeFile(join(root, 'not included.txt'), 'private\n')
  assert.match((await repo.execute(root, { ...request('diff'), path: 'not included.txt' })).text, /\+private/)
  const initial = await repo.state(root)
  assert.equal(initial.upstream, '')
  assert.equal(initial.additions, 2); assert.equal(initial.deletions, 1)
  await repo.execute(root, { ...request('stage'), path: 'file.txt' })
  assert.match((await repo.execute(root, { ...request('diff'), path: 'file.txt', staged: true })).text, /\+second/)
  await repo.execute(root, { ...request('commit'), includeUnstaged: false })
  assert.match(await run('git', ['log', '-1', '--format=%s'], root), /更新 1 个文件/)
  assert.deepEqual((await repo.state(root)).files.map(f => f.path), ['not included.txt'])
})
test('unstaging an unborn branch preserves the working file', async () => {
  const { root, repo, request } = await fixture({ unborn: true })
  await writeFile(join(root, 'first.txt'), 'first\n')
  await repo.execute(root, { ...request('stage'), path: 'first.txt' })
  await repo.execute(root, { ...request('unstage'), path: 'first.txt' })
  assert.equal(await readFile(join(root, 'first.txt'), 'utf8'), 'first\n')
  assert.equal((await repo.state(root)).files[0].index, '?')
})
test('main/master writes are blocked and unsafe paths never stage', async () => {
  const { root, repo, request } = await fixture()
  await writeFile(join(root, 'file.txt'), 'dirty\n')
  await assert.rejects(repo.execute(root, { ...request('stage'), path: '../outside' }), /状态已变化/)
  await repo.execute(root, { ...request('switch'), branch: 'main' })
  for (const action of ['commit', 'commitPush', 'push', 'createPR']) await assert.rejects(repo.execute(root, request(action)), /保护分支/)
  assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'dirty\n')
})
test('include unstaged, create branch and push to a real local bare remote', async () => {
  const { root, repo, request } = await fixture()
  const bare = await mkdtemp(join(cache, 'dshgit-remote-'))
  await run('git', ['init', '--bare', bare], root)
  await run('git', ['remote', 'add', 'origin', bare], root)
  await repo.execute(root, { ...request('createBranch'), branch: 'codex/delivery' })
  await writeFile(join(root, 'added 中文.txt'), 'new\n')
  await repo.execute(root, { ...request('commitPush'), message: 'test delivery', includeUnstaged: true })
  const state = await repo.state(root)
  assert.equal(state.files.length, 0); assert.equal(state.upstream, 'origin/codex/delivery')
  assert.equal((await exec('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/codex/delivery'])).stdout.trim(), (await run('git', ['rev-parse', 'HEAD'], root)).trim())
})
test('commit success is preserved and reported when push fails', async () => {
  const { root, repo, request } = await fixture()
  await writeFile(join(root, 'file.txt'), 'new\n')
  const result = await repo.execute(root, { ...request('commitPush'), includeUnstaged: true, message: 'kept locally' })
  assert.match(result.notice, /提交已成功，推送失败/)
  assert.match(await run('git', ['log', '-1', '--format=%s'], root), /kept locally/)
})
test('renaming and unstaging preserve both paths without deleting work', async () => {
  const { root, repo, request } = await fixture()
  await run('git', ['mv', 'file.txt', 'renamed.txt'], root)
  await repo.execute(root, { ...request('unstage'), path: 'renamed.txt' })
  assert.equal(await readFile(join(root, 'renamed.txt'), 'utf8'), 'before\n')
  assert.equal((await run('git', ['diff', '--cached', '--name-only'], root)).trim(), '')
})
test('PR requests use origin identity, stdin body, explicit head/base and draft', async () => {
  const { root, request } = await fixture()
  await run('git', ['remote', 'add', 'origin', 'https://github.com/example/project.git'], root)
  const calls = [], head = (await run('git', ['rev-parse', 'HEAD'], root)).trim()
  const repo = new GitRepository(async (program, args, cwd, input, allowed) => {
    if (program === 'git' && args.includes('ls-remote')) return `${head}\trefs/heads/codex/test\n`
    if (program === 'git') return run(program, args, cwd, input, allowed)
    calls.push({ args, input })
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'example/project', defaultBranchRef: { name: 'main' } })
    if (args[1] === 'list') return '[]'
    return 'https://github.com/example/project/pull/42\n'
  })
  const result = await repo.execute(root, { ...request('createPR'), base: 'main', title: 'New panel', body: 'Literal $() and `code`\nsecond line', draft: true })
  assert.equal(result.pr.number, 42)
  assert.equal(calls[0].args[2], 'example/project')
  assert.equal(calls.at(-1).input, 'Literal $() and `code`\nsecond line')
  assert.ok(calls.at(-1).args.includes('--draft'))
  assert.ok(calls.at(-1).args.includes('codex/test'))
})
