import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DashboardObserver, SecurityManager, SecurityHost, FindingState, findingStatuses, findingStatusRequestSchema, findingRequestSchema, canRepair, projectFindings, sessionLocation, scanScope, workspaceTools, contribution, startSchema, detailRequestSchema } from '../dist/test-runtime.js'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'

const base = { id: 'task-1', workspace: 'workspace', sessionId: 'chat', status: 'completed', phase: 'reporting', provider: 'fixture', model: 'fixture', findings: 1, startedAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-11T00:01:00Z' }
const data = { workspace: 'workspace', tasks: [base], findings: [], warnings: [], capabilities: { findingStatusEditing: true, findingRepair: true }, selection: null }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const ok = value => ({ ok: true, value })

test('new conversations use source workspace ownership and canonical paths, never a same-title or parent folder', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cyber-session-location-')))
  const workspace = join(root, 'repository')
  await mkdir(workspace)
  const other = { id: 'other', title: 'Same title', path: root, sessionIds: [] }
  const own = { id: 'own', title: 'Same title', path: workspace, sessionIds: ['source'] }
  let groups = [other, own]
  const ctx = new Context()
  try {
    ctx.provide('workspaceRegistry', { list: () => groups })
    assert.deepEqual(await sessionLocation(ctx, join(workspace, '.'), 'source'), { workspaceId: 'own' })
    assert.deepEqual(await sessionLocation(ctx, workspace, 'ungrouped-source'), { workspaceId: 'own' })
    const duplicate = { ...own, id: 'duplicate', sessionIds: ['different-source'] }
    groups = [duplicate, own]
    assert.deepEqual(await sessionLocation(ctx, workspace, 'source'), { workspaceId: 'own' })
    await assert.rejects(sessionLocation(ctx, workspace, 'ungrouped-source'), /多个工作区分组/)
    groups = [other]
    assert.deepEqual(await sessionLocation(ctx, workspace, 'source'), { cwd: workspace })
  } finally { await ctx.fiber.dispose() }
})

test('history preserves completed scans, real phase timestamps and workspace isolation across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cyber-history-'))
  const driver = { async run(task, hooks) {
    await hooks.update({ phase: 'discovery' })
    await hooks.update({ phase: 'discovery' })
    await hooks.update({ phase: 'reporting', reportPath: 'fixture-report.md' })
  }, async stop() {} }
  const manager = new SecurityManager(root, driver)
  for (let i = 0; i < 2; i++) {
    const { task } = await manager.start('workspace', 'chat', 'fixture', 'model', undefined, `request-${i}`, 'src')
    await manager.wait('workspace', task.id, new AbortController().signal)
  }
  const other = await manager.start('neighbor', 'chat', 'fixture', 'model')
  await manager.wait('neighbor', other.task.id, new AbortController().signal)
  const history = await manager.list('workspace')
  assert.equal(history.length, 2)
  assert.equal(history[0].instructions, 'request-1')
  assert.equal(history[0].scope, 'src')
  assert.deepEqual(history[0].timeline.map(event => event.phase), ['preflight', 'discovery', 'reporting'])
  assert.ok(history[0].timeline.every(event => !Number.isNaN(Date.parse(event.at))))
  history[0].status = 'failed'
  assert.equal((await manager.state('workspace')).task.status, 'completed')
  await assert.rejects(manager.cancel('workspace', 'stale-task'), /扫描任务已变化/)
  await manager.dispose()
  const restored = new SecurityManager(root, driver)
  assert.equal((await restored.list('workspace')).length, 2)
  assert.equal((await restored.state('workspace')).task.instructions, 'request-1')
  assert.equal((await restored.list('neighbor')).length, 1)
  assert.equal(JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8')).length, 3)
  await restored.dispose()
})

test('findings merge canonical fingerprints without claiming absence means remediation', async () => {
  const fixture = JSON.parse(await readFile(new URL('../vendor/codex-security/examples/completed-scan/findings.json', import.meta.url), 'utf8'))
  const details = { report: 'fixture', threatModel: '', findings: JSON.stringify(fixture) }
  const next = { ...base, id: 'task-2', startedAt: '2026-11-11T01:00:00Z' }
  const findings = projectFindings([{ task: next, details }, { task: base, details }, { task: { ...base, id: 'empty', startedAt: '2026-11-11T02:00:00Z' }, details: { ...details, findings: '{"findings":[]}' } }])
  assert.equal(findings.length, 1)
  assert.equal(findings[0].occurrences, 2)
  assert.equal(findings[0].taskId, next.id)
  assert.equal(findings[0].firstSeen, base.startedAt)
  assert.equal(findings[0].lastSeen, next.startedAt)
  assert.equal(findings[0].severity, 'high')
  assert.match(findings[0].remediation, /Normalize destinations/)
  assert.equal(findings[0].locations[0].startLine, 41)
  assert.throws(() => projectFindings([{ task: base, details: { ...details, findings: '{}' } }]))
})

test('focused tools enforce selected file/directory and reject external or junction scopes', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cyber-scope-')))
  const workspace = join(root, 'workspace')
  await mkdir(join(workspace, 'src'), { recursive: true })
  await writeFile(join(workspace, 'src', 'auth.ts'), 'allowed scope')
  await writeFile(join(workspace, 'excluded.txt'), 'excluded content')
  assert.equal(await scanScope(workspace, 'src'), 'src')
  await assert.rejects(scanScope(workspace, '..'))
  await assert.rejects(scanScope(workspace, 'missing'))
  await symlink(root, join(workspace, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(scanScope(workspace, 'escape'))
  const tools = await workspaceTools(workspace, 'src')
  const exec = { signal: new AbortController().signal }
  const read = tools.find(tool => tool.name === 'read')
  assert.match(await read.execute({ file_path: 'src/auth.ts' }, exec), /allowed scope/)
  await assert.rejects(read.execute({ file_path: 'excluded.txt' }, exec))
  const glob = tools.find(tool => tool.name === 'glob')
  assert.deepEqual(JSON.parse(await glob.execute({ pattern: '**/*' }, exec)).files, ['src/auth.ts'])
  const fileTools = await workspaceTools(workspace, 'src/auth.ts')
  assert.deepEqual(JSON.parse(await fileTools.find(tool => tool.name === 'glob').execute({ pattern: '**/*' }, exec)).files, ['src/auth.ts'])
})

test('dashboard observation is read-only; duplicate actions, stale responses and error recovery are safe', async () => {
  const pending = deferred(), action = deferred()
  let response = Promise.resolve(ok(data)), starts = 0
  const observer = new DashboardObserver({ dashboard: () => response,
    start: () => { starts++; return action.promise } }, 'chat')
  observer.start(); await observer.refresh()
  assert.equal(starts, 0)
  response = pending.promise
  const read = observer.refresh()
  const start = observer.act('start', { scope: 'src' })
  assert.equal(await observer.act('start'), false)
  assert.equal(starts, 1)
  pending.resolve(ok({ ...data, workspace: 'stale' })); await read
  assert.equal(observer.getSnapshot().data.workspace, 'workspace')
  response = Promise.resolve(ok(data))
  action.resolve({ ok: false, error: { message: 'Start rejected' } })
  assert.equal(await start, false)
  await observer.refresh()
  assert.equal(observer.getSnapshot().error, 'Start rejected')
  const snapshot = observer.getSnapshot()
  observer.dispose(); await observer.refresh()
  assert.equal(observer.getSnapshot(), snapshot)
})

test('RPC descriptors use method-specific strict schemas and scoped historical report ids', () => {
  assert.equal(contribution.descriptors.length, 8)
  assert.equal(startSchema.parse({ sessionId: 'chat', scope: 'src', model: 'm' }).scope, 'src')
  assert.throws(() => startSchema.parse({ sessionId: 'chat', shell: 'execute' }))
  assert.throws(() => startSchema.parse({ sessionId: 'chat', instructions: 'x'.repeat(12001) }))
  assert.equal(detailRequestSchema.parse({ sessionId: 'chat', taskId: 'history-id' }).taskId, 'history-id')
  assert.equal(contribution.descriptors.find(item => item.method === 'dashboard').result.typeSymbol, 'SecurityDashboard')
  assert.equal(findingStatusRequestSchema.parse({ sessionId: 'chat', findingId: 'id', status: 'fixed' }).status, 'fixed')
  assert.throws(() => findingStatusRequestSchema.parse({ sessionId: 'chat', findingId: 'id', status: 'closed' }))
  assert.throws(() => findingStatusRequestSchema.parse({ sessionId: 'chat', findingId: '../outside', status: 'new', workspace: 'neighbor' }))
  assert.throws(() => findingRequestSchema.parse({ sessionId: 'chat', findingId: 'finding', prompt: 'Client-supplied instructions' }))
  assert.deepEqual(findingStatuses.filter(canRepair), ['new', 'triaged', 'in_progress'])
})

test('editable finding statuses survive restart, serialize writes and remain scoped without altering reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cyber-finding-status-'))
  const store = new FindingState(root)
  for (const status of findingStatuses) {
    await store.set('workspace', 'shared-fingerprint', status)
    assert.equal((await store.statuses('workspace')).get('shared-fingerprint'), status)
  }
  await Promise.all([store.set('workspace', 'one', 'triaged'), store.set('workspace', 'two', 'fixed'), store.set('neighbor', 'shared-fingerprint', 'new')])
  const restored = new FindingState(root)
  assert.equal((await restored.statuses('workspace')).get('shared-fingerprint'), 'false_positive')
  assert.equal((await restored.statuses('workspace')).get('one'), 'triaged')
  assert.equal((await restored.statuses('workspace')).get('two'), 'fixed')
  assert.equal((await restored.statuses('neighbor')).get('shared-fingerprint'), 'new')
  const path = join(root, 'finding-statuses.json')
  await writeFile(path, '{invalid')
  const invalid = new FindingState(root)
  await assert.rejects(invalid.set('workspace', 'one', 'new'))
  assert.equal(await readFile(path, 'utf8'), '{invalid')
})

test('finding status save errors remain visible and stale polls cannot undo a successful edit', async () => {
  const pending = deferred(), saved = deferred()
  const finding = { ...projectFindings([{ task: base, details: { report: '', threatModel: '', findings: await readFile(new URL('../vendor/codex-security/examples/completed-scan/findings.json', import.meta.url), 'utf8') } }])[0], status: 'new' }
  let response = ok({ ...data, findings: [finding] })
  let write = saved.promise
  const observer = new DashboardObserver({ dashboard: async () => response, setFindingStatus: () => write }, 'chat')
  observer.start(); await observer.refresh()
  response = pending.promise
  const poll = observer.refresh()
  const edit = observer.setFindingStatus(finding.id, 'in_progress')
  response = ok({ ...data, findings: [{ ...finding, status: 'in_progress' }] })
  saved.resolve(response); await edit
  pending.resolve(ok({ ...data, findings: [finding] })); await poll
  assert.equal(observer.getSnapshot().data.findings[0].status, 'in_progress')
  write = Promise.resolve({ ok: false, error: { message: 'Fixture status save failed' } })
  await observer.setFindingStatus(finding.id, 'fixed'); await observer.refresh()
  assert.equal(observer.getSnapshot().data.findings[0].status, 'in_progress')
  assert.equal(observer.getSnapshot().error, 'Fixture status save failed')
  observer.dispose()
})

test('an old host never receives the new status endpoint; explicit refresh clears errors after upgrade', async () => {
  let response = ok({ ...data, capabilities: undefined }), calls = 0
  const observer = new DashboardObserver({ dashboard: async () => response, async setFindingStatus() { calls++; throw new Error('transport failure: HTTP 404') } }, 'chat')
  observer.start(); await observer.refresh()
  await observer.setFindingStatus('finding', 'triaged')
  assert.equal(calls, 0)
  assert.match(observer.getSnapshot().error, /完整退出并重新打开 DSH/)
  response = ok(data)
  await observer.refresh(true)
  assert.equal(observer.getSnapshot().error, null)
  await observer.setFindingStatus('finding', 'triaged')
  assert.equal(calls, 1)
  assert.match(observer.getSnapshot().error, /完整退出并重新打开 DSH/)
  observer.dispose()
})

test('repair actions deduplicate clicks, retry navigation without resubmitting, and block old hosts or closed findings', async () => {
  const finding = projectFindings([{ task: base, details: { report: '', threatModel: '', findings: await readFile(new URL('../vendor/codex-security/examples/completed-scan/findings.json', import.meta.url), 'utf8') } }])[0]
  let dashboard = { ...data, findings: [finding] }, requests = 0, opens = 0
  const entered = deferred(), release = deferred()
  const observer = new DashboardObserver({ dashboard: async () => ok(dashboard), async repairFinding(request) {
    requests++; entered.resolve(); await release.promise
    assert.deepEqual(request, { sessionId: 'chat', findingId: finding.id })
    return ok({ workspace: 'workspace', findingId: finding.id, conversationId: 'repair-chat' })
  } }, 'chat')
  observer.start(); await observer.refresh()
  const open = async id => { assert.equal(id, 'repair-chat'); if (opens++ === 0) throw new Error('Fixture navigation failed') }
  const first = observer.repairFinding(finding.id, open)
  await entered.promise
  assert.equal(await observer.repairFinding(finding.id, open), false)
  release.resolve()
  assert.equal(await first, false)
  assert.match(observer.getSnapshot().error, /navigation failed/)
  assert.equal(await observer.repairFinding(finding.id, open), true)
  assert.equal(requests, 1)
  assert.equal(opens, 2)
  dashboard = { ...dashboard, capabilities: { findingStatusEditing: true } }
  await observer.refresh()
  assert.equal(await observer.repairFinding(finding.id, open), false)
  assert.match(observer.getSnapshot().error, /修复接口尚未加载/)
  dashboard = { ...dashboard, capabilities: data.capabilities, findings: [{ ...finding, status: 'fixed' }] }
  await observer.refresh(true)
  assert.equal(await observer.repairFinding(finding.id, open), false)
  assert.equal(requests, 1)
  observer.dispose()
})

test('dashboard timeout becomes a visible retryable error and ignores a late read', async () => {
  const stalled = deferred()
  let response = stalled.promise, reads = 0
  const observer = new DashboardObserver({ dashboard: () => { reads++; return response } }, 'chat', 15)
  observer.start()
  await new Promise(done => setTimeout(done, 35))
  assert.equal(observer.getSnapshot().loading, false)
  assert.match(observer.getSnapshot().error, /读取超时/)
  assert.equal(observer.getSnapshot().data, null)
  assert.equal(reads, 1, 'Initial failure waits for explicit retry')
  response = Promise.resolve(ok(data))
  await observer.refresh()
  assert.equal(observer.getSnapshot().error, null)
  assert.equal(observer.getSnapshot().data.workspace, 'workspace')
  stalled.resolve(ok({ ...data, workspace: 'late-result' }))
  await Promise.resolve()
  assert.equal(observer.getSnapshot().data.workspace, 'workspace')
  observer.dispose()
})

test('native Cordis/Typert gateway reads cold repositories without activation, caches cwd and publishes a separate scan conversation without activating the source chat', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cyber-gateway-')))
  const workspace = join(root, 'workspace'), neighbor = join(root, 'neighbor'), storage = join(root, 'state')
  await Promise.all([mkdir(workspace), mkdir(neighbor), mkdir(storage)])
  await writeFile(join(storage, 'tasks.json'), JSON.stringify([
    { ...base, workspace, scanId: 'own-scan' }, { ...base, id: 'neighbor-task', workspace: neighbor, scanId: 'neighbor-scan' },
  ]))
  const ctx = new Context(), descriptors = []
  const attached = new Map(), metadataReads = new Map(), activations = [], scanStarts = []
  const defaultSelection = { provider: 'fixture', model: 'fixture-model' }
  const sessionSelection = { ...defaultSelection, reasoningEffort: 'high' }
  let modelCalls = 0, metadataFailure = true, rejectRepair = false
  const repairCalls = []
  ctx.provide('typert', { remotes: { register: value => descriptors.push(value) }, local: { get: () => undefined, hasSeen: () => false }, lookups: { definitions: () => [] } })
  ctx.provide('sessions', { get: id => attached.get(id) })
  ctx.provide('sessionPersistence', {
    async stat(id) {
      metadataReads.set(id, (metadataReads.get(id) ?? 0) + 1)
      await new Promise(done => setImmediate(done))
      if (id === 'retry-chat' && metadataFailure) { metadataFailure = false; throw new Error('Fixture persistence read failed') }
      if (!['chat', 'neighbor-chat', 'retry-chat', 'no-cwd'].includes(id)) return undefined
      return { header: { id, ...(id !== 'no-cwd' ? { cwd: id === 'neighbor-chat' ? neighbor : workspace } : {}) }, revision: 'fixture' }
    },
    open() { throw new Error('Cold reads must not open session event history') },
  })
  // 当前宿主没有 inspect；只暴露启动真正需要的恢复方法。 Current host has no inspect method.
  ctx.provide('sessionController', {
    async create(request) { repairCalls.push({ method: 'create', request }); return { sessionId: `repair-${repairCalls.length}` } },
    async selectModel(request) { repairCalls.push({ method: 'selectModel', request }) },
    async rename(request) { repairCalls.push({ method: 'rename', request }) },
    async prompt(request) { repairCalls.push({ method: 'prompt', request }); await new Promise(done => setImmediate(done)); if (rejectRepair) throw new Error('Fixture repair prompt rejected'); return { accepted: true } },
    async resolveAgent(id) {
      activations.push(id)
      if (id === 'blocked-chat') return { error: new Error('Fixture session writer held') }
      const session = { id, header: { cwd: id === 'neighbor-chat' ? neighbor : workspace } }
      attached.set(id, session)
      return { agent: { session } }
    },
  })
  ctx.provide('agents', { create() { modelCalls++; throw new Error('Unexpected model call') } })
  ctx.provide('sessionProjections', { stateOf: session => {
    assert.equal(attached.get(session.id), session, 'Cold reads must not project an unattached session')
    return { pending: sessionSelection }
  } })
  ctx.provide('agentDefaultModel', { currentSelection: () => defaultSelection })
  ctx.provide('llm', { listProviders: () => [{ id: 'fixture', name: 'Fixture' }], listModels: async () => [{ id: 'fixture-model', name: 'Fixture model' }], resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high' }] } }) })
  ctx.provide('tools', { register() {} })
  ctx.provide('sandboxPolicy', {})
  const fiber = ctx.plugin(SecurityHost, { stateDirectory: storage })
  await fiber.await()
  const service = ctx.get('deepseekSecurity')
  // 上游报告内容与扫描驱动用无模型夹具；RPC/工作区筛选/任务持久化均走真实实现。
  // Reports and scan execution are fixtures; RPC, workspace filtering and task persistence are real.
  const findingArtifact = await readFile(new URL('../vendor/codex-security/examples/completed-scan/findings.json', import.meta.url), 'utf8')
  service.workbench.details = async scanId => ({ report: scanId, findings: scanId === 'own-scan' ? findingArtifact : '{"findings":[]}', threatModel: '' })
  service.manager.driver.run = async (task, hooks) => { scanStarts.push(structuredClone(task)); await hooks.update({ conversationId: task.id, reportPath: 'fixture-report.md' }) }
  const gatewayFiber = ctx.plugin(inner => { new TypertGatewayService(inner, {}) })
  await gatewayFiber.await()
  const lifetime = new AbortController()
  const peer = { id: 'cyber-fixture-peer', ctx, principal: { kind: 'owner' }, interactions: 'none', signal: lifetime.signal, async dispose() { lifetime.abort() } }
  const gateway = ctx.get('typertGateway')
  const invoke = (method, request = { sessionId: 'chat' }) => gateway.invoke({ peer, namespace: 'deepseekSecurity', method, args: { request } })
  try {
    assert.equal(descriptors[0].descriptors.length, 8)
    assert.deepEqual(remoteMethods(ctx.get('deepseekSecurity')).map(item => item.method).sort(), ['cancel', 'dashboard', 'details', 'models', 'repairFinding', 'setFindingStatus', 'start', 'state'])
    const [overview, state, models, details] = await Promise.all([
      invoke('dashboard'), invoke('state'), invoke('models'), invoke('details'),
    ])
    assert.equal(overview.tasks.length, 1)
    assert.equal(overview.tasks[0].workspace, workspace)
    assert.deepEqual(overview.selection, { ...defaultSelection, ultra: false })
    assert.equal(state.task.id, base.id)
    assert.equal(models[0].efforts[0], 'high')
    assert.equal(details.report, 'own-scan')
    const findingId = overview.findings[0].id
    assert.equal(overview.findings[0].status, 'new')
    assert.equal((await invoke('setFindingStatus', { sessionId: 'chat', findingId, status: 'in_progress' })).findings[0].status, 'in_progress')
    assert.equal((await invoke('dashboard')).findings[0].status, 'in_progress')
    await assert.rejects(invoke('setFindingStatus', { sessionId: 'neighbor-chat', findingId, status: 'fixed' }), /不属于当前仓库/)
    await assert.rejects(invoke('setFindingStatus', { sessionId: 'chat', findingId: 'unknown-id', status: 'fixed' }), /不属于当前仓库/)
    assert.equal((await invoke('dashboard', { sessionId: 'neighbor-chat' })).tasks[0].id, 'neighbor-task')
    assert.equal((await invoke('details', { sessionId: 'neighbor-chat' })).report, 'neighbor-scan')
    for (let i = 0; i < 3; i++) await invoke('dashboard')
    assert.equal(metadataReads.get('chat'), 1, 'Polling and concurrent reads share the cached immutable cwd')
    assert.equal(metadataReads.get('neighbor-chat'), 1)
    assert.deepEqual(activations, [])
    assert.equal(attached.size, 0)
    assert.equal(scanStarts.length, 0)
    assert.equal(modelCalls, 0)
    await assert.rejects(invoke('details', { sessionId: 'chat', taskId: 'neighbor-task' }), /没有已完成/)
    await assert.rejects(invoke('dashboard', { sessionId: 'unknown' }), /仓库会话不存在/)
    await assert.rejects(invoke('state', { sessionId: 'no-cwd' }), /没有工作区路径/)
    await assert.rejects(invoke('state', { sessionId: 'retry-chat' }), /persistence read failed/)
    assert.equal((await invoke('state', { sessionId: 'retry-chat' })).workspace, workspace)
    assert.equal(metadataReads.get('retry-chat'), 2, 'A failed metadata read remains retryable')
    await assert.rejects(invoke('start', { sessionId: 'blocked-chat' }), /仓库会话不存在/)
    assert.equal(scanStarts.length, 0)
    await assert.rejects(invoke('start', { sessionId: 'chat', reasoningEffort: 'ultra' }), /不能作为模型推理参数/)
    await assert.rejects(invoke('start', { sessionId: 'chat', ultra: true }), /Ultra 插件暂不可用/)
    await assert.rejects(invoke('start', { sessionId: 'chat', scope: '../neighbor' }), /不能越出工作区/)
    assert.deepEqual(activations, [])
    assert.equal(scanStarts.length, 0)
    await assert.rejects(invoke('cancel', { sessionId: 'chat', taskId: 'neighbor-task' }), /任务已变化/)
    const started = await invoke('start', { sessionId: 'neighbor-chat', reasoningEffort: 'high', instructions: 'Fixture authorized scan' })
    await service.manager.wait(neighbor, started.task.id, lifetime.signal)
    assert.deepEqual(activations, [])
    assert.equal(started.task.conversationId, started.task.id)
    assert.equal(started.task.conversation, true)
    assert.equal(scanStarts.length, 1)
    assert.equal(scanStarts[0].workspace, neighbor)
    assert.equal(scanStarts[0].sessionId, 'neighbor-chat')
    assert.equal(scanStarts[0].reasoningEffort, 'high')
    assert.equal(scanStarts[0].instructions, 'Fixture authorized scan')
    assert.deepEqual((await invoke('dashboard')).selection, { ...defaultSelection, ultra: false })
    assert.equal((await invoke('state')).task.id, base.id)
    assert.equal(modelCalls, 0)
    for (const status of ['fixed', 'wont_fix', 'duplicate', 'false_positive']) {
      await invoke('setFindingStatus', { sessionId: 'chat', findingId, status })
      await assert.rejects(invoke('repairFinding', { sessionId: 'chat', findingId }), /已结束处置/)
    }
    assert.equal(repairCalls.length, 0)
    await assert.rejects(invoke('repairFinding', { sessionId: 'neighbor-chat', findingId }), /不属于当前仓库/)
    await invoke('setFindingStatus', { sessionId: 'chat', findingId, status: 'triaged' })
    rejectRepair = true
    await assert.rejects(invoke('repairFinding', { sessionId: 'chat', findingId }), /prompt rejected/)
    assert.equal((await invoke('dashboard')).findings[0].status, 'triaged')
    rejectRepair = false
    const before = repairCalls.length
    const [repair, duplicate] = await Promise.all([invoke('repairFinding', { sessionId: 'chat', findingId }), invoke('repairFinding', { sessionId: 'chat', findingId })])
    assert.equal(repair.conversationId, duplicate.conversationId)
    assert.equal(repair.workspace, workspace)
    assert.deepEqual(repairCalls.slice(before).map(call => call.method), ['create', 'selectModel', 'rename', 'prompt'])
    assert.deepEqual(repairCalls[before].request, { cwd: workspace })
    const prompt = repairCalls.at(-1).request
    assert.equal(prompt.sessionId, repair.conversationId)
    assert.equal(prompt.mode, 'queue')
    assert.match(prompt.content[0].text, /Unsafe archive extraction can escape the output directory/)
    assert.match(prompt.content[0].text, /不擅自推送/)
    assert.match(prompt.content[0].text, /own-scan/)
    assert.equal((await invoke('dashboard')).findings[0].status, 'in_progress')
    assert.deepEqual(activations, [])
  } finally { await peer.dispose(); await gatewayFiber.dispose(); await fiber.dispose(); await ctx.fiber.dispose() }
})
