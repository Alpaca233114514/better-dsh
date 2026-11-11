import assert from 'node:assert/strict'
import { access, mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import { DshScanDriver, SecurityManager, projectFindings, startFindingRepair } from '../dist/test-runtime.js'

const runtime = new URL('../../.cache/dsh-022-compat/runtime/', import.meta.url)
let native
async function nativeRuntime() {
  if (native) return native
  const source = new URL('node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js', runtime)
  await access(source)
  const require = createRequire(new URL('package.json', runtime))
  const runtimeImports = { name: 'desktop-runtime', setup(builder) {
    builder.onResolve({ filter: /^(?:@deepseek-ai\/|zod$|mime-types$)/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
  } }
  // 只在测试产物中导出宿主原有内部类，不改安装文件。
  // Expose the installed controller classes in a test artifact without modifying the runtime.
  await build({ stdin: { contents: `${await readFile(source, 'utf8')}\nexport { ApiSessionAgentController, SessionCommandController };`,
    resolveDir: fileURLToPath(new URL('.', source)) }, outfile: 'dist/native-controller-test.js',
    bundle: true, platform: 'node', format: 'esm', target: 'es2022', plugins: [runtimeImports] })
  await build({ entryPoints: ['../Ultra/src/host.ts'], outfile: 'dist/native-ultra-test.js',
    bundle: true, platform: 'node', format: 'esm', target: 'es2022', external: ['zod'], plugins: [runtimeImports] })
  const names = ['cordis', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent', 'dsh-llm',
    'dsh-agent-loop', 'dsh-sandbox-policy', 'dsh-tool-executor-native', 'dsh-session-persistence-jsonl', 'dsh-session-query', 'dsh-session-title']
  const modules = Object.fromEntries(await Promise.all(names.map(async name => [name, await import(pathToFileURL(require.resolve(`@deepseek-ai/${name}`)).href)])))
  native = { modules, ...await import('../dist/native-controller-test.js'), ultra: await import('../dist/native-ultra-test.js') }
  return native
}

for (const ultra of [false, true]) test(`desktop 0.2.2 normal scan conversation: ${ultra ? 'real Ultra mode and bounded child' : 'selected model'}; transcript and findings survive completion`, async t => {
  try { await access(new URL('node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js', runtime)) }
  catch { t.skip('Desktop compatibility runtime is not present'); return }
  const n = await nativeRuntime(), m = n.modules
  const root = await realpath(await mkdtemp(join(tmpdir(), 'security-conversation-')))
  const workspace = join(root, 'workspace'), state = join(root, 'state')
  await mkdir(workspace); await mkdir(state); await mkdir(join(workspace, 'src'))
  await writeFile(join(workspace, 'src', 'sample.py'), 'def add(a, b): return a + b\n')
  await writeFile(join(workspace, 'excluded.txt'), 'EXCLUDED_FIXTURE')
  const ctx = new m.cordis.Context(), requests = [], handles = [], children = []
  let manager, rootCalls = 0, childCalls = 0, unsafeCalls = 0
  const details = { report: '# Synthetic conversation report\n\nNot a model audit.', threatModel: 'Fixture',
    findings: await readFile(new URL('../vendor/codex-security/examples/completed-scan/findings.json', import.meta.url), 'utf8') }
  const fixtureWorkbench = { async start() { return { scanId: 'conversation-fixture', handoffClaimToken: 'fixture-claim' } },
    async progress() {}, async draft(_id, draft) { assert.equal(draft.complete, true); return { findingCount: 1 } },
    async complete() { return { progress: { status: 'complete' }, scanDir: state } }, async details() { return details }, async stop() {} }
  class Scripted extends m['dsh-llm'].LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: 'DeepSeek fixture', reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] } } }
    async listModels(provider) { return [{ provider, id: 'deepseek-fixture', name: 'DeepSeek fixture' }] }
    async *stream(options) {
      assert.equal(options.model, 'deepseek-fixture')
      const child = !options.tools.some(tool => tool.name === 'complete_codex_security_scan')
      requests.push({ child, effort: options.reasoningEffort, messages: JSON.stringify(options.messages) })
      assert.ok(!requests.at(-1).messages.includes('EXCLUDED_FIXTURE'))
      assert.ok(!options.tools.some(tool => tool.name === 'unsafe_fixture'))
      let name, args = {}
      if (child) {
        if (childCalls++ === 0) { name = 'read'; args = { file_path: 'src/sample.py' } }
      } else {
        assert.equal(options.reasoningEffort, ultra ? 'max' : 'high')
        const step = rootCalls++
        if (ultra && step === 0) name = 'subagent'
        else if (step === (ultra ? 1 : 0)) { name = 'read'; args = { file_path: 'src/sample.py' } }
        else if (step === (ultra ? 2 : 1)) {
          name = 'record_codex_security_scan_draft'
          args = { json: JSON.stringify({ scanId: 'conversation-fixture', complete: true, findings: [],
            threatModel: { summary: 'Synthetic fixture only.' }, coverage: { completeness: 'complete', surfaces: [], explicitExclusions: [], deferred: [] } }) }
        } else { assert.equal(step, ultra ? 3 : 2); name = 'complete_codex_security_scan' }
      }
      yield { type: 'block-start', index: 0, blockType: name ? 'tool-call' : 'text' }
      yield { type: 'block-end', index: 0, block: name ? { type: 'tool-call', id: `fixture-${requests.length}`, name, arguments: JSON.stringify(args) } : { type: 'text', text: 'Synthetic child review complete.' } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
      yield { type: 'finish', reason: { kind: name ? 'tool-calls' : 'stop' } }
    }
  }
  try {
    for (const name of ['dsh-llm', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent']) await ctx.plugin(m[name].default)
    await ctx.plugin(m['dsh-sandbox-policy'].default, { mode: 'read-only', workspaceRoot: workspace })
    await ctx.plugin(m['dsh-agent-loop'].default, { agents: [] })
    await ctx.plugin(m['dsh-tool-executor-native'])
    await ctx.plugin(m['dsh-session-persistence-jsonl'], { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(m['dsh-session-query'].default)
    await ctx.plugin(m['dsh-session-title'].default, { fallbackMaxWords: 12, fallbackMaxBytes: 120, maxTitleBytes: 240 })
    const selection = { provider: 'deepseek-fixture', model: 'deepseek-fixture' }
    ctx.provide('agentDefaultModel', { currentSelection: () => selection, async saveSelection() {} })
    ctx.provide('workspaceRegistry', { archivedSessionIds: [], get() {}, list: () => [] })
    ctx.llm.registerAdapter([selection.provider], new Scripted())
    const agents = new n.ApiSessionAgentController(ctx)
    const commands = new n.SessionCommandController(ctx, agents, workspace)
    ctx.provide('sessionController', { create: request => commands.create(request), resolveAgent: id => agents.resolveAgent(id),
      selectModel: request => commands.selectModel(request), rename: request => commands.rename(request),
      async modelCatalog() { return { groups: [{ id: selection.provider, name: 'DeepSeek fixture', models: [await ctx.llm.resolveModelInfo(selection.provider, selection.model)] }] } } })
    const fixture = (name, execute) => m['dsh-tools'].defineTool({ name, description: name, parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute })
    ctx.tools.register(fixture('unsafe_fixture', async () => { unsafeCalls++; return 'unsafe' }))
    ctx.tools.register(fixture('subagent', async (_args, exec) => {
      assert.equal(ultra, true)
      const handle = await ctx.agents.create({ sessionId: `child-${exec.agent.id}`, parentAgent: exec.agent,
        meta: { cwd: workspace, parentSession: exec.agent.id, origin: 'subagent' }, agentOptions: { ...selection, reasoningEffort: 'high' } })
      handles.push(handle); children.push(handle.agent)
      assert.match(JSON.stringify(await ctx.tools.execute({ calls: [{ type: 'tool-call', id: 'excluded', name: 'read', arguments: JSON.stringify({ file_path: 'excluded.txt' }) }], agent: handle.agent, signal: exec.signal })), /Security workspace boundary/)
      handle.agent.followup(m['dsh-llm'].createUserMessage({ content: [{ type: 'text', text: 'Synthetic bounded review.' }], source: { kind: 'user' } }))
      await handle.agent.whenIdle()
      return 'Synthetic child reviewed src/sample.py'
    }))
    ctx.provide('typert', { remotes: { register() {} }, local: { get() {}, hasSeen: () => false }, lookups: { definitions: () => [] } })
    ctx.provide('subagents', { getProvider: () => ({ prepareContinuable() {}, capabilities: { agentOptions: true, depthLimit: true } }) })
    await ctx.plugin(n.ultra)
    manager = new SecurityManager(state, new DshScanDriver(ctx, fixtureWorkbench))
    const started = await manager.start(workspace, 'source-chat-not-loaded', selection.provider, selection.model, ultra ? 'max' : 'high', 'Synthetic contract test only.', 'src', { conversation: true, ultra })
    const published = await manager.conversation(workspace, started.task.id)
    assert.equal(published.task.conversationId, started.task.id)
    assert.equal(ctx.agents.get('source-chat-not-loaded'), undefined)
    const session = ctx.sessions.get(started.task.id)
    assert.equal(session.header.origin, undefined)
    assert.equal(session.header.parentSession, undefined)
    await manager.wait(workspace, started.task.id, new AbortController().signal)
    const task = (await manager.state(workspace)).task
    assert.equal(task.status, 'completed', task.error)
    assert.equal(ctx.get('dshUltra').active(session), ultra)
    assert.equal(ctx.agents.get(task.id).status, 'idle')
    assert.equal(unsafeCalls, 0)
    assert.equal(children.length, ultra ? 1 : 0)
    assert.ok(children.every(agent => agent.status === 'idle'))
    assert.equal(task.usage.calls, ultra ? 6 : 3)
    assert.equal(projectFindings([{ task, details }]).length, 1)
    const transcript = JSON.stringify(session.snapshotEvents())
    assert.match(transcript, /Synthetic conversation report/)
    assert.match(transcript, /报告已同步安全管理界面/)
    assert.ok((await ctx.sessionPersistence.stat(task.id)).header)
    assert.match(JSON.stringify(await ctx.tools.execute({ calls: [{ type: 'tool-call', id: 'after', name: 'read', arguments: JSON.stringify({ file_path: 'src/sample.py' }) }], agent: ctx.agents.get(task.id), signal: new AbortController().signal })), /本次扫描已结束/)
  } finally { await manager?.dispose(); for (const handle of handles) await handle.dispose(); await ctx.fiber.dispose() }
})

for (const ultra of [false, true]) test(`desktop 0.2.2 repair conversation runs the filled prompt with normal tools and ${ultra ? 'Ultra' : 'selected effort'}`, async t => {
  try { await access(new URL('node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js', runtime)) }
  catch { t.skip('Desktop compatibility runtime is not present'); return }
  const n = await nativeRuntime(), m = n.modules
  const root = await realpath(await mkdtemp(join(tmpdir(), 'security-repair-')))
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const sourceFile = join(workspace, 'sample.py')
  await writeFile(sourceFile, 'SYNTHETIC_UNFIXED\n')
  const ctx = new m.cordis.Context(), guardCalls = []
  const selection = { provider: 'deepseek-fixture', model: 'deepseek-fixture', reasoningEffort: 'high', ultra }
  const finding = { id: 'fixture-finding', taskId: 'source-scan', status: 'new', title: 'Synthetic repair target', severity: 'high',
    summary: 'Fixture only, not a real vulnerability.', locations: [{ path: 'sample.py', startLine: 1 }], evidence: 'SYNTHETIC_UNFIXED',
    remediation: 'Replace the fixture marker.', validation: 'Static fixture', attackPath: '', firstSeen: '2026-11-11T00:00:00Z', lastSeen: '2026-11-11T00:00:00Z', occurrences: 1 }
  const task = { id: 'source-scan', workspace, scanId: 'fixture-upstream-id', scope: 'sample.py', provider: 'scan-provider', model: 'scan-model', startedAt: '2026-11-11T00:00:00Z' }
  let calls = 0
  class Scripted extends m['dsh-llm'].LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: 'DeepSeek fixture', reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] } } }
    async listModels(provider) { return [{ provider, id: 'deepseek-fixture', name: 'DeepSeek fixture' }] }
    async *stream(options) {
      assert.equal(options.reasoningEffort, ultra ? 'max' : 'high')
      const messages = JSON.stringify(options.messages)
      for (const text of ['Synthetic repair target', 'sample.py', 'fixture-upstream-id', '不擅自推送', 'Auto Review']) assert.ok(messages.includes(text), text)
      assert.ok(options.tools.some(tool => tool.name === 'fixture_fix'), 'Repair must retain the ordinary session tools')
      const first = calls++ === 0
      yield { type: 'block-start', index: 0, blockType: first ? 'tool-call' : 'text' }
      yield { type: 'block-end', index: 0, block: first ? { type: 'tool-call', id: 'fixture-fix', name: 'fixture_fix', arguments: '{}' } : { type: 'text', text: 'Synthetic fixture changed and verified. Not a real security fix.' } }
      yield { type: 'finish', reason: { kind: first ? 'tool-calls' : 'stop' } }
    }
  }
  try {
    for (const name of ['dsh-llm', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent']) await ctx.plugin(m[name].default)
    await ctx.plugin(m['dsh-agent-loop'].default, { agents: [] })
    await ctx.plugin(m['dsh-tool-executor-native'])
    await ctx.plugin(m['dsh-session-persistence-jsonl'], { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(m['dsh-session-query'].default)
    await ctx.plugin(m['dsh-session-title'].default, { fallbackMaxWords: 12, fallbackMaxBytes: 120, maxTitleBytes: 240 })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: selection.provider, model: selection.model }), async saveSelection() {} })
    ctx.provide('workspaceRegistry', { archivedSessionIds: [], get() {}, list: () => [] })
    ctx.llm.registerAdapter([selection.provider], new Scripted())
    ctx.provide('attachments', { async admitPromptContent(content) { return content } })
    ctx.provide('fileUploads', { bindPrompt() { return { commit() {}, [Symbol.dispose]() {} } } })
    const agents = new n.ApiSessionAgentController(ctx), commands = new n.SessionCommandController(ctx, agents, workspace)
    ctx.provide('sessionController', { create: request => commands.create(request), resolveAgent: id => agents.resolveAgent(id),
      selectModel: request => commands.selectModel(request), rename: request => commands.rename(request),
      prompt: request => commands.prompt(request, { kind: 'user', rpcId: request.requestId }),
      async modelCatalog() { return { groups: [{ id: selection.provider, models: [await ctx.llm.resolveModelInfo(selection.provider, selection.model)] }] } } })
    ctx.tools.register(m['dsh-tools'].defineTool({ name: 'fixture_fix', description: 'Modify only the synthetic fixture marker.', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { assert.equal(await readFile(sourceFile, 'utf8'), 'SYNTHETIC_UNFIXED\n'); await writeFile(sourceFile, 'SYNTHETIC_FIXED\n'); return 'Fixture written' } }))
    ctx.tools.guard(exec => { guardCalls.push(exec.name) })
    ctx.provide('typert', { remotes: { register() {} }, local: { get() {}, hasSeen: () => false }, lookups: { definitions: () => [] } })
    ctx.provide('subagents', { getProvider: () => ({ prepareContinuable() {}, capabilities: { agentOptions: true, depthLimit: true } }) })
    await ctx.plugin(n.ultra)
    const result = await startFindingRepair(ctx, workspace, finding, task, selection)
    assert.notEqual(result.conversationId, task.id)
    const agent = ctx.agents.get(result.conversationId)
    await agent.whenIdle()
    assert.equal(calls, 2)
    assert.equal(agent.session.header.cwd, workspace)
    assert.equal(agent.session.header.origin, undefined)
    assert.equal(ctx.get('dshUltra').active(agent.session), ultra)
    assert.deepEqual(guardCalls, ['fixture_fix'])
    assert.equal(await readFile(sourceFile, 'utf8'), 'SYNTHETIC_FIXED\n')
    assert.match(JSON.stringify(agent.session.snapshotEvents()), /Synthetic fixture changed and verified/)
    assert.ok((await ctx.sessionPersistence.stat(result.conversationId)).header)
    assert.equal(ctx.agents.get(task.id), undefined)
  } finally { await ctx.fiber.dispose() }
})
