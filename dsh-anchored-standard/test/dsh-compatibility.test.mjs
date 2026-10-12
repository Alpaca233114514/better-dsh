import assert from 'node:assert/strict'
import test from 'node:test'
import { generatePatch, modes } from '../scripts/generate-dsh-patch.mjs'
import { apply } from '../shared/custom-bash.mjs'

test('all modes generate DSH 0.2 preset declarations with absolute module URLs', () => {
  for (const mode of Object.keys(modes)) {
    const patch = generatePatch(mode)
    assert.match(patch, /name: '@deepseek-ai\/dsh-agent-preset'/)
    assert.match(patch, new RegExp('id: ' + mode))
    assert.match(patch, /plugins:\n/)
    assert.match(patch, /name: "file:\/\/\/.*\.mjs"/)
    assert.match(patch, /prefix: You are a helpful software engineer assistant\./)
    assert.match(patch, /@deepseek-ai\/dsh-workflow-ptc/)
    assert.doesNotMatch(patch, /name: '\@deepseek-ai\/dsh-fs-local'|backgroundMode:|workflow-worker-thread/)
  }
})

test('unknown preset modes fail before producing an overlay', () => {
  assert.throws(() => generatePatch('unknown'), /Unknown mode/)
})

function shellRuntime(overrides = {}) {
  let tool
  const calls = []
  const ctx = {
    tools: { register: (value) => { tool = value } },
    workingDirectory: { ensure: async () => 'D:/current-directory' },
    sandboxPolicy: { resolve: () => ({ mode: 'read-only', workspaceRoot: 'C:/project' }) },
    sandbox: { confine: async (argv, policy) => { calls.push(policy); return { argv: ['runner', ...argv] } } },
    subprocess: {
      resolveExecutable: async () => 'C:/Git/bash.exe',
      spawn: (spec) => { calls.push(spec); return { done: Promise.resolve({ exitCode: 0 }), terminate: async () => {} } },
    },
    shellEnv: { collect: () => ({ DSH_WEB_URL: 'http://localhost' }) },
    timeout: () => () => {},
    ...overrides,
  }
  apply(ctx)
  return { tool, calls }
}
const exec = { agent: { session: { header: { cwd: 'C:/original-directory' } } } }

test('custom bash follows current directory and forwards the read-only policy to confinement', async () => {
  const { tool, calls } = shellRuntime()
  await tool.execute({ command: 'pwd' }, exec)
  assert.equal(calls[0].mode, 'read-only')
  assert.equal(calls[1].cwd, 'D:/current-directory')
  assert.deepEqual(calls[1].argv, ['runner', 'C:/Git/bash.exe', '-c', 'pwd'])
  assert.equal(calls[1].env.DSH_WEB_URL, 'http://localhost')
})

test('sandbox refusal never falls back to a raw spawn', async () => {
  const { tool, calls } = shellRuntime({ sandbox: { confine: async () => { throw new Error('SANDBOX_UNAVAILABLE') } } })
  await assert.rejects(() => tool.execute({ command: 'echo hi' }, exec), /SANDBOX_UNAVAILABLE/)
  assert.equal(calls.length, 0)
})

test('the configured deadline terminates a hung subprocess and disposes its timer', async () => {
  let deadline, complete, terminated = 0, disposed = 0
  const { tool } = shellRuntime({
    timeout: (fn, ms) => { deadline = fn; assert.equal(ms, 120000); return () => { disposed++ } },
    subprocess: {
      resolveExecutable: async () => 'bash',
      spawn: () => ({ done: new Promise((r) => { complete = r }), terminate: async () => { terminated++; complete({ exitCode: null }) } }),
    },
  })
  const pending = tool.execute({ command: 'sleep 999' }, exec)
  await new Promise((r) => setImmediate(r))
  deadline()
  await assert.rejects(() => pending, /timed out after 120000 ms/)
  assert.equal(terminated, 1)
  assert.equal(disposed, 1)
})
