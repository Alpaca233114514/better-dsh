import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import test from 'node:test'
import { SecurityManager, Workbench, DshScanDriver, securityTools, source, securityMention, securityContext, ProgressObserver } from '../dist/test-runtime.js'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { createScope, bindScopeParent, scopeOf } from '@deepseek-ai/dsh-scope'

const cache = fileURLToPath(new URL('../../.cache/', import.meta.url))
await mkdir(cache, { recursive: true })
const root = await mkdtemp(join(cache, 'security-tests-'))
let counter = 0
async function directory() {
  const path = join(root, String(++counter))
  await mkdir(path)
  return path
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const next = () => new Promise(resolve => setImmediate(resolve))
const instructions = '帮我扫描这段仓库，重点检查 sample.py，排除 vendor'
const scanArgs = { instructions }
async function settled(manager, workspace) {
  for (let i = 0; i < 400; i++) {
    const state = await manager.state(workspace)
    if (!['starting', 'running', 'cancelling'].includes(state.task?.status)) return state.task
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Test task did not settle')
}

test('double start and session switches retain one workspace task; completion survives reload', async () => {
  const release = deferred(), entered = deferred()
  let starts = 0
  const path = await directory()
  const driver = { async run(_task, hooks) {
    starts++; entered.resolve(); await release.promise
    await hooks.update({ scanId: 'scan-test', reportPath: '/reports/report.md', findings: 2 })
  }, async stop() {} }
  const manager = new SecurityManager(path, driver)
  const [first, second] = await Promise.all([
    manager.start('workspace-a', 'chat-a', 'dsh-test', 'test-model'),
    manager.start('workspace-a', 'chat-b', 'dsh-test', 'test-model'),
  ])
  assert.equal(first.task.id, second.task.id)
  await entered.promise
  assert.equal(starts, 1)
  assert.equal((await manager.state('workspace-b')).task, null)
  release.resolve()
  assert.equal((await settled(manager, 'workspace-a')).status, 'completed')
  await manager.dispose()
  const restored = new SecurityManager(path, driver)
  assert.equal((await restored.state('workspace-a')).task.findings, 2)
  assert.equal(starts, 1)
  await restored.dispose()
})

test('cancellation drains in-flight work and cannot become a late success', async () => {
  const entered = deferred(), release = deferred()
  let stopped = false
  const manager = new SecurityManager(await directory(), {
    async run(_task, hooks) { entered.resolve(); await release.promise; await hooks.update({ reportPath: '/late' }) },
    async stop(_task, cancelled) { stopped = cancelled },
  })
  await manager.start('workspace-a', 'chat', 'p', 'm')
  await entered.promise
  const cancelling = manager.cancel('workspace-a')
  await next()
  assert.equal((await manager.state('workspace-a')).task.status, 'cancelling')
  release.resolve()
  assert.equal((await cancelling).task.status, 'cancelled')
  assert.equal(stopped, true)
  await manager.dispose()
})

test('missing report and runtime exceptions are failures, never completion', async () => {
  for (const fail of [false, true]) {
    const manager = new SecurityManager(await directory(), {
      async run() { if (fail) throw new Error('Provider authentication failed') }, async stop() {},
    })
    await manager.start('workspace', 'chat', 'p', 'm')
    const task = await settled(manager, 'workspace')
    assert.equal(task.status, 'failed')
    assert.match(task.error, fail ? /authentication failed/ : /without a verified report/)
    await manager.dispose()
  }
})

test('restart marks an interrupted scan without spending model tokens', async () => {
  const path = await directory()
  await writeFile(join(path, 'tasks.json'), JSON.stringify([{
    id: 'task', workspace: 'workspace', sessionId: 'old-chat', scanId: 'scan',
    status: 'running', phase: 'validation', provider: 'p', model: 'm', findings: 1,
    startedAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z',
  }]))
  let stopped = 0
  const manager = new SecurityManager(path, {
    async run() { assert.fail('Restoring state must not run a model') }, async stop() { stopped++ },
  })
  const { task } = await manager.state('workspace')
  assert.equal(task.status, 'interrupted')
  assert.equal(task.findings, 1)
  assert.equal(stopped, 1)
  await manager.dispose()
})

test('corrupt state is preserved and blocks start', async () => {
  const path = await directory()
  await writeFile(join(path, 'tasks.json'), '{broken')
  const manager = new SecurityManager(path, { async run() { assert.fail() }, async stop() {} })
  await assert.rejects(manager.start('workspace', 'chat', 'p', 'm'))
  assert.equal(await readFile(join(path, 'tasks.json'), 'utf8'), '{broken')
})

test('dispose cancels and drains the DSH-owned activity', async () => {
  const entered = deferred()
  const manager = new SecurityManager(await directory(), {
    async run(_task, { signal }) {
      entered.resolve()
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    }, async stop() {},
  })
  await manager.start('workspace', 'chat', 'p', 'm')
  await entered.promise
  await manager.dispose()
  assert.equal((await manager.state('workspace')).task.status, 'cancelled')
  await assert.rejects(manager.start('workspace', 'chat', 'p', 'm'), /disposed/)
})

test('real upstream workbench: draft validation, final report, cancellation and failure', async () => {
  const workspace = await directory(), storage = await directory()
  await writeFile(join(workspace, 'sample.py'), 'def add(a, b): return a + b\n')
  const wb = new Workbench(storage, process.env.PYTHON || 'python')
  const scan = await wb.start(workspace, 'fixture-standard', 'scripted-test-no-model')
  const id = scan.scanId
  assert.equal(scan.progress.status, 'running')
  await assert.rejects(wb.complete(id, scan.handoffClaimToken))
  await assert.rejects(wb.draft(id, { scanId: id, findings: [], coverage: { completeness: 'complete' } }, new AbortController().signal))
  const draft = {
    scanId: id, complete: true, findings: [],
    threatModel: { summary: 'Test fixture only: a local addition function, no external entry point.' },
    coverage: { completeness: 'complete', surfaces: [{ label: 'sample.py addition', disposition: 'no_issue_found', notes: 'Contract fixture; not a model scan.' }],
      explicitExclusions: [], deferred: [], limitations: ['Scripted integration fixture; no model security claim.'] },
  }
  await wb.draft(id, draft, new AbortController().signal)
  const complete = await wb.complete(id, scan.handoffClaimToken)
  assert.equal(complete.progress.status, 'complete')
  const details = await wb.details(id)
  assert.ok(details.report.length > 100)
  assert.match(details.threatModel, /addition function/)
  assert.deepEqual(JSON.parse(details.findings).findings, [])
  const cancelled = await wb.start(workspace, 'fixture-cancel', 'no-model')
  await wb.stop(cancelled.scanId, true, 'cancel test')
  assert.equal((await wb.get(cancelled.scanId)).progress.status, 'canceled')
  const failed = await wb.start(workspace, 'fixture-fail', 'no-model')
  await wb.stop(failed.scanId, false, 'Provider unavailable')
  assert.equal((await wb.get(failed.scanId)).progress.status, 'failed')
})

test('chat invocation reaches native scan tool, child AgentLoop and verified report in the parent conversation', async () => {
  const workspace = await directory(), storage = await directory()
  await writeFile(join(workspace, 'sample.py'), 'def add(a, b): return a + b\n')
  const requests = []
  let scanId, manager, observer, parentRequests = 0, sawDiscovery = false
  class ScriptedAdapter extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model } }
    async *stream(options) {
      const tools = options.tools.map(t => t.name)
      if (tools.includes('security_scan')) {
        parentRequests++
        assert.ok(parentRequests <= 2, 'Parent retried a failed scan tool')
        if (parentRequests === 1) {
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          assert.match(JSON.stringify(options.messages), /帮我扫描这段仓库/)
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'scan-call', name: 'security_scan', arguments: JSON.stringify(scanArgs) } }
          yield { type: 'finish', reason: { kind: 'tool-calls' } }
        } else {
          assert.match(JSON.stringify(options.messages), /Standard 静态审计/)
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Fixture report received.' } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
        return
      }
      requests.push(options)
      assert.match(JSON.stringify(options.messages), /重点检查 sample.py，排除 vendor/)
      scanId = (await manager.state(workspace)).task.scanId
      await observer.refresh()
      if (observer.getSnapshot().task?.phase === 'discovery') sawDiscovery = true
      assert.ok(tools.includes('record_codex_security_scan_draft'))
      assert.ok(['read', 'glob', 'grep'].every(name => tools.includes(name)))
      assert.ok(!tools.includes('unsafe_fixture'))
      const index = requests.length
      const name = index === 1 ? 'security_progress' : index === 2 ? 'record_codex_security_scan_draft' : 'complete_codex_security_scan'
      const args = index === 1 ? { phase: 'discovery' } : index === 2 ? { json: JSON.stringify({
        scanId, complete: true, findings: [], threatModel: { summary: 'Native loop fixture only.' },
        coverage: { completeness: 'complete', surfaces: [{ label: 'sample.py', disposition: 'no_issue_found' }], explicitExclusions: [], deferred: [] },
      }) } : {}
      assert.ok(index <= 3, 'Unexpected retry: inspect tool failure')
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `call-${index}`, name, arguments: JSON.stringify(args) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    }
  }
  const ctx = new Context()
  try {
    for (const Plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(Plugin)
    await ctx.plugin(SandboxPolicy, { mode: 'read-only', workspaceRoot: workspace })
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.llm.registerAdapter(['dsh-fixture-provider'], new ScriptedAdapter())
    const presetKey = {}
    let presetScope
    await ctx.plugin(Object.assign(inner => { presetScope = createScope(inner, presetKey) },
      { inject: ['tools', 'systemPrompt'] }))
    let mounted = false
    ctx.provide('agentPresets', {
      async mount(scope) { bindScopeParent(scopeOf(scope), presetKey); mounted = true; return { id: 'fixture-preset' } },
      composeFrom(scope) { bindScopeParent(scopeOf(scope), presetKey); return { id: 'fixture-preset' } },
    })
    for (const name of ['read', 'glob', 'grep', 'unsafe_fixture']) {
      presetScope.ctx.tools.register(defineTool({ name, description: 'Fixture only', parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: async () => 'fixture',
      }))
    }
    const workbench = new Workbench(storage, process.env.PYTHON || 'python')
    manager = new SecurityManager(storage, new DshScanDriver(ctx, workbench))
    observer = new ProgressObserver({
      async state() { return { ok: true, value: await manager.state(workspace) } },
      async cancel() { return { ok: true, value: await manager.cancel(workspace) } },
    }, 'parent-chat')
    observer.start()
    await observer.refresh()
    assert.equal(observer.getSnapshot().task, null, 'No progress before model invokes scan')
    for (const tool of securityTools(manager, workbench)) ctx.tools.register(tool)
    const parent = await ctx.agents.create({ sessionId: 'parent-chat', meta: { cwd: workspace },
      agentOptions: { provider: 'dsh-fixture-provider', model: 'chosen-model' },
      setup: scope => ctx.agentPresets.mount(scope).then(() => {}),
    })
    const submitted = await source.codec.serialize(securityMention, new AbortController().signal) + instructions
    parent.agent.followup(createUserMessage({ content: [{ type: 'text', text: submitted }], source: { kind: 'user' } }))
    await parent.agent.whenIdle()
    const { task } = await manager.state(workspace)
    assert.equal(parentRequests, 2)
    assert.equal(task.status, 'completed')
    assert.equal(task.instructions, instructions)
    assert.equal(requests.length, 3)
    assert.equal(sawDiscovery, true, 'The real security_progress tool updates the composer observer')
    await observer.refresh()
    assert.equal(observer.getSnapshot().task, null, 'Completed scans leave the result in chat, not an idle panel')
    assert.equal(mounted, true)
    assert.ok(requests.every(r => r.model === 'chosen-model' && r.provider === 'dsh-fixture-provider'))
    assert.ok(task.reportPath.endsWith('report.md'))
    assert.equal(ctx.agents.get(task.id), undefined)
    const events = JSON.stringify(parent.agent.session.snapshotEvents())
    assert.match(events, /security_scan/)
    assert.match(events, /Fixture report received/)
    await parent.dispose()
  } finally { observer?.dispose(); await manager?.dispose(); await ctx.fiber.dispose() }
})

function progressTask(change = {}) {
  return { id: 'scan-task', workspace: 'workspace', sessionId: 'chat', status: 'running',
    phase: 'threat_model', findings: 0, provider: 'fixture', model: 'fixture',
    startedAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z', ...change }
}
const rpcState = task => ({ ok: true, value: { workspace: 'workspace', task } })

test('progress unwraps RPC results, hides terminal tasks and preserves cancel errors', async () => {
  let task = null, failRead = false, failCancel = true, cancels = 0
  const observer = new ProgressObserver({
    async state({ sessionId }) { assert.equal(sessionId, 'chat'); return failRead ? { ok: false, error: { message: 'Connection lost' } } : rpcState(task) },
    async cancel() { cancels++; return failCancel ? { ok: false, error: { message: 'Cancel denied' } } : rpcState(progressTask({ status: 'cancelled' })) },
  }, 'chat')
  try {
    observer.start(); await observer.refresh()
    assert.equal(observer.getSnapshot().task, null)
    task = progressTask(); await observer.refresh()
    assert.equal(observer.getSnapshot().task.phase, 'threat_model')
    failRead = true; await observer.refresh()
    assert.equal(observer.getSnapshot().error, 'Connection lost')
    assert.equal(observer.getSnapshot().task.id, task.id, 'Keep active progress on connection loss')
    failRead = false; await observer.refresh()
    assert.equal(observer.getSnapshot().error, null)
    await observer.cancel(); await observer.refresh()
    assert.equal(observer.getSnapshot().error, 'Cancel denied', 'Polling cannot erase an action error')
    failCancel = false; await observer.cancel()
    assert.equal(observer.getSnapshot().task, null)
    assert.equal(cancels, 2)
    for (const status of ['completed', 'failed', 'cancelled', 'interrupted']) {
      task = progressTask({ status }); await observer.refresh()
      assert.equal(observer.getSnapshot().task, null)
    }
  } finally { observer.dispose() }
})

test('progress cancellation wins over an old poll and ignores responses after session disposal', async () => {
  const stale = deferred(), stopped = deferred(), departed = deferred()
  let response = Promise.resolve(rpcState(progressTask())), cancels = 0
  const observer = new ProgressObserver({
    state() { return response },
    cancel() { cancels++; return stopped.promise },
  }, 'chat')
  observer.start(); await observer.refresh()
  response = stale.promise
  const polling = observer.refresh()
  const cancelling = observer.cancel()
  await observer.cancel()
  assert.equal(cancels, 1)
  assert.equal(observer.getSnapshot().stopping, true)
  stopped.resolve(rpcState(progressTask({ status: 'cancelled' })))
  await cancelling
  stale.resolve(rpcState(progressTask()))
  await polling
  assert.equal(observer.getSnapshot().task, null)
  response = departed.promise
  const lastPoll = observer.refresh()
  observer.dispose()
  departed.resolve(rpcState(progressTask()))
  await lastPoll
  assert.equal(observer.getSnapshot().task, null)
})

test('@DeepSeek Security inserts an atomic mention, preserving the user request until Send', async () => {
  assert.equal((await source.candidates({}, {}))[0].name, 'DeepSeek Security')
  assert.deepEqual(await source.candidates({}, { quoted: true }), [])
  assert.deepEqual(await source.candidates({}, { drilled: true }), [])
  const picked = source.onPick({})
  assert.deepEqual(picked, { insert: { source: 'deepseek-security', ref: securityMention, label: 'DeepSeek Security', clipboardText: securityMention } })
  assert.equal(source.codec.clipboardText(picked.insert.ref), '@DeepSeek Security')
  assert.equal(await source.codec.serialize(picked.insert.ref, new AbortController().signal), securityContext)
  const controller = new AbortController()
  controller.abort(new Error('Send cancelled'))
  await assert.rejects(source.codec.serialize(picked.insert.ref, controller.signal), /Send cancelled/)
})

test('native chat Stop cancels and drains the scan; failure/report lookup never start a second scan', async () => {
  const workspace = await directory(), storage = await directory()
  const entered = deferred()
  let starts = 0, stops = 0
  const manager = new SecurityManager(storage, {
    async run(_task, { signal }) {
      starts++; entered.resolve()
      await new Promise((_, reject) => {
        if (signal.aborted) reject(signal.reason)
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }, async stop() { stops++ },
  })
  const [scan, report] = securityTools(manager, { stateDirectory: storage,
    async details() { assert.fail('Cancelled scans cannot return completed reports') },
  })
  const controller = new AbortController()
  const exec = { signal: controller.signal, agent: {
    session: { id: 'chat', header: { cwd: workspace } }, options: { provider: 'p', model: 'm', reasoningEffort: 'max' },
  } }
  try {
    const running = scan.execute(scanArgs, exec)
    const rejected = assert.rejects(running, /Chat stopped/)
    await entered.promise
    assert.equal((await manager.state(workspace)).task.reasoningEffort, 'max')
    controller.abort(new Error('Chat stopped'))
    await rejected
    assert.equal((await manager.state(workspace)).task.status, 'cancelled')
    assert.equal(stops, 1)
    assert.match(await report.execute({}, { ...exec, signal: new AbortController().signal }), /cancelled/)
    await assert.rejects(scan.execute(scanArgs, exec), /Chat stopped/)
    assert.equal(starts, 1)
  } finally { await manager.dispose() }
})

test('scan tool propagates failure and rejects missing workspace/model before execution', async () => {
  const workspace = await directory(), storage = await directory()
  let starts = 0
  const manager = new SecurityManager(storage, { async run() { starts++; throw new Error('fixture provider failed') }, async stop() {} })
  const [scan] = securityTools(manager, { stateDirectory: storage, async details() { assert.fail('No report on failure') } })
  const exec = { signal: new AbortController().signal, agent: {
    session: { id: 'chat', header: { cwd: workspace } }, options: { provider: 'p', model: 'm' },
  } }
  try {
    await assert.rejects(scan.execute(scanArgs, { signal: exec.signal }), /工作区会话/)
    await assert.rejects(scan.execute(scanArgs, { ...exec, agent: { ...exec.agent, options: {} } }), /选择 DSH 模型/)
    await assert.rejects(scan.execute({ instructions: ' ' }, exec), /扫描需求/)
    assert.equal(starts, 0)
    await assert.rejects(scan.execute(scanArgs, exec), /fixture provider failed/)
    assert.equal(starts, 1)
  } finally { await manager.dispose() }
})
