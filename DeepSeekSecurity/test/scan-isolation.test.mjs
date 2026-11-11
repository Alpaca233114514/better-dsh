import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, realpath, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'

await build({ stdin: { contents: "export * from './src/scan-isolation.ts'; export * from './src/workspace-tools.ts'", resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
  outfile: fileURLToPath(new URL('../dist/scan-isolation-test.js', import.meta.url)), bundle: true, platform: 'node', format: 'esm', target: 'es2022', external: ['@deepseek-ai/*', 'zod', 'zod/*'] })
const { ScanIsolation, workspaceTools } = await import('../dist/scan-isolation-test.js')
const fixture = (name, execute = async () => 'fixture') => defineTool({ name, description: name, parameters: {},
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute })
const task = (id, workspace, ultra = false) => ({ id, workspace, sessionId: 'source-chat', status: 'starting', phase: 'preflight',
  provider: 'fixture', model: 'fixture', findings: 0, startedAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-11T00:00:00Z', ultra })
let call = 0
async function harness() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'scan-isolation-')))
  const workspace = join(root, 'workspace'), outside = join(root, 'outside')
  await mkdir(workspace); await mkdir(outside); await mkdir(join(workspace, 'src'))
  await writeFile(join(workspace, 'src', 'safe.txt'), 'SAFE_FIXTURE')
  await writeFile(join(workspace, 'excluded.txt'), 'EXCLUDED_FIXTURE')
  await writeFile(join(outside, 'canary.txt'), 'OUTSIDE_FIXTURE')
  const ctx = new Context()
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin)
  await ctx.plugin(SandboxPolicy, { mode: 'read-only', workspaceRoot: workspace })
  await ctx.plugin(AgentLoop, { agents: [] })
  const isolation = new ScanIsolation(ctx)
  const create = (id, parent, options = {}) => ctx.agents.create({ sessionId: id, ...(parent ? { parentAgent: parent } : {}),
    meta: { cwd: options.cwd ?? workspace, ...(parent ? { parentSession: parent.id, origin: 'subagent' } : {}), ...(options.fork ? { isSeeded: true } : {}) },
    ...(options.fork ? { seed: [], inheritedEventCount: 0 } : {}),
    agentOptions: { provider: 'fixture', model: 'no-network' }, setup: options.setup })
  const execute = (agent, name, args = {}) => ctx.tools.execute({ callId: `isolation-${++call}`, name, arguments: args, agent, signal: new AbortController().signal })
  return { ctx, isolation, workspace, outside, create, execute, readers: await workspaceTools(workspace, 'src') }
}

test('scan guards block late local tools and same-name reader replacement, retaining exact scope and reporting identities', async () => {
  const h = await harness()
  try {
    let unsafeCalls = 0
    for (const name of ['read', 'pwsh', 'write', 'web_fetch']) h.ctx.tools.register(fixture(name, async () => { unsafeCalls++; return 'UNSAFE' }))
    const cleanup = h.isolation.track(task('root', h.workspace), h.readers)
    const report = fixture('security_progress')
    const readerDisposers = []
    const root = await h.create('root', undefined, { setup(scope, agent) {
      for (const reader of h.readers) readerDisposers.push(scope.tools.register(reader))
      scope.tools.register(report); h.isolation.allow(agent, report)
    } })
    assert.equal(h.ctx.sandboxPolicy.resolve({ session: root.agent.session }).mode, 'read-only')
    assert.match(JSON.stringify(await h.execute(root.agent, 'read', { file_path: 'src/safe.txt' })), /SAFE_FIXTURE/)
    for (const path of ['excluded.txt', '../outside/canary.txt', join(h.outside, 'canary.txt')]) {
      const result = await h.execute(root.agent, 'read', { file_path: path })
      assert.equal(result.isError, true)
      assert.ok(!JSON.stringify(result).includes('OUTSIDE_FIXTURE'))
    }
    assert.equal((await h.execute(root.agent, 'security_progress')).isError, false)
    root.agent.ctx.tools.register(fixture('spawn_teammate', async () => { unsafeCalls++; return 'UNSAFE' }))
    root.agent.ctx.tools.register(fixture('late_shell', async () => { unsafeCalls++; return 'UNSAFE' }))
    for (const name of ['spawn_teammate', 'late_shell']) assert.match(JSON.stringify(await h.execute(root.agent, name)), /scan isolation/)
    const read = h.readers[0]
    assert.equal(read.name, 'read')
    // 登记者卸载可信定义后再以同名替换；不能只依赖工具名称。
    // Replace a released trusted definition; a name alone must never authorize execution.
    readerDisposers[0]()
    root.agent.ctx.tools.register(fixture('read', async () => { unsafeCalls++; return 'UNSAFE' }))
    assert.match(JSON.stringify(await h.execute(root.agent, 'read')), /scan isolation/)
    assert.equal(unsafeCalls, 0)
    await cleanup()
    assert.match(JSON.stringify(await h.execute(root.agent, 'security_progress')), /本次扫描已结束/)
    assert.equal(root.agent.status, 'idle')
  } finally { await h.ctx.fiber.dispose() }
})

test('child, grandchild, fork and resumed identities are isolated; outside cwd and post-cleanup descendants fail before publication', async () => {
  const h = await harness()
  try {
    const cleanup = h.isolation.track(task('lineage-root', h.workspace, true), h.readers)
    const native = fixture('subagent')
    h.ctx.tools.register(native)
    const root = await h.create('lineage-root')
    const child = await h.create('child', root.agent)
    const grandchild = await h.create('grandchild', child.agent)
    const fork = await h.create('fork', root.agent, { fork: true })
    for (const handle of [root, child, grandchild, fork]) {
      assert.equal(h.isolation.owns('lineage-root', handle.agent.id), true)
      assert.equal((await h.execute(handle.agent, 'subagent')).isError, false)
      assert.match(JSON.stringify(await h.execute(handle.agent, 'read', { file_path: 'src/safe.txt' })), /SAFE_FIXTURE/)
      assert.equal(h.ctx.sandboxPolicy.resolve({ session: handle.agent.session }).mode, 'read-only')
    }
    await grandchild.dispose()
    const resumed = await h.create('grandchild', child.agent)
    assert.match(JSON.stringify(await h.execute(resumed.agent, 'read', { file_path: 'excluded.txt' })), /Security workspace boundary/)
    await assert.rejects(h.create('outside-child', child.agent, { cwd: h.outside }), /outside the workspace/)
    assert.equal(h.ctx.agents.get('outside-child'), undefined)
    const ownerOnly = await h.ctx.agents.create({ sessionId: 'runtime-owner-only', parentAgent: child.agent,
      meta: { cwd: h.workspace }, agentOptions: { provider: 'fixture', model: 'no-network' } })
    assert.equal(h.isolation.owns('lineage-root', ownerOnly.agent.id), true)
    assert.equal((await h.execute(ownerOnly.agent, 'read', { file_path: 'excluded.txt' })).isError, true)
    const unrelated = await h.create('unrelated')
    assert.equal(h.ctx.tools.get('subagent', unrelated.agent), native)
    const cancelled = []
    for (const handle of [root, child, resumed]) {
      Object.defineProperty(handle.agent, 'status', { get: () => 'running', configurable: true })
      handle.agent.cancel = () => cancelled.push(handle.agent.id)
    }
    const draining = cleanup()
    assert.equal(h.isolation.owns('lineage-root', root.agent.id), true, 'Usage remains attributable while descendants drain')
    assert.equal(cleanup(), draining)
    await draining
    assert.equal(h.isolation.owns('lineage-root', root.agent.id), false)
    assert.deepEqual(cancelled.sort(), ['child', 'grandchild'])
    await assert.rejects(h.create('late-child', child.agent), /本次扫描已结束/)
    assert.equal((await h.execute(unrelated.agent, 'subagent')).isError, false)
  } finally { await h.ctx.fiber.dispose() }
})

test('cleanup during asynchronous admission aborts tracked creation before model execution', async () => {
  const h = await harness()
  try {
    const cleanup = h.isolation.track(task('aborted-root', h.workspace), h.readers)
    const creation = h.create('aborted-root', undefined, { setup() { void cleanup() } })
    await assert.rejects(creation, /本次扫描已结束/)
    assert.equal(h.ctx.agents.get('aborted-root'), undefined)
  } finally { await h.ctx.fiber.dispose() }
})

test('actual 0.2.2 runtime native Teams registration cannot bypass ordinary scan isolation', async t => {
  const runtime = new URL('../../.cache/dsh-022-compat/runtime/node_modules/@deepseek-ai/', import.meta.url)
  try { await access(new URL('dsh-experimental-agent-team/lib/index.js', runtime)) }
  catch { t.skip('Actual desktop compatibility runtime is not present'); return }
  const load = name => import(new URL(`${name}/lib/index.js`, runtime))
  const [cordis, sessions, projections, prompts, tools, agents, llm, loop, sandbox, teams, teamTools, executor, persistence] = await Promise.all([
    'cordis', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent', 'dsh-llm', 'dsh-agent-loop',
    'dsh-sandbox-policy', 'dsh-experimental-agent-team', 'dsh-experimental-tool-agent-team', 'dsh-tool-executor-native', 'dsh-session-persistence-jsonl',
  ].map(load))
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'actual-team-isolation-')))
  const ctx = new cordis.Context()
  try {
    for (const plugin of [llm.default, sessions.default, projections.default, prompts.default, tools.default, agents.default]) await ctx.plugin(plugin)
    await ctx.plugin(sandbox.default, { mode: 'read-only', workspaceRoot: workspace })
    await ctx.plugin(loop.default, { agents: [] })
    await ctx.plugin(executor)
    await ctx.plugin(persistence, { root: join(workspace, '.fixture-sessions'), compression: 'none' })
    ctx.provide('subagents', { isOwned() { return false }, async disposeChildren() {}, startActivation() { throw new Error('Ordinary scans must not delegate') } })
    await ctx.plugin(teams.default)
    await ctx.plugin(teamTools)
    const isolation = new ScanIsolation(ctx)
    const cleanup = isolation.track(task('native-team-root', workspace), [])
    const root = await ctx.agents.create({ sessionId: 'native-team-root', meta: { cwd: workspace }, agentOptions: { provider: 'fixture', model: 'no-network' } })
    assert.ok(ctx.tools.get('spawn_teammate', root.agent), 'Native Team plugin installed its own-scope tool')
    const batch = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: 'team-probe', name: 'spawn_teammate', arguments: JSON.stringify({ name: 'probe', description: 'probe', prompt: 'probe' }) }], agent: root.agent, signal: new AbortController().signal })
    assert.match(JSON.stringify(batch), /scan isolation/)
    await cleanup()
  } finally { await ctx.fiber.dispose() }
})
