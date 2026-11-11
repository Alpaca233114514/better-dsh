import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as Cordis from '@deepseek-ai/cordis'
import * as slotCore from '@deepseek-ai/dsh-client-ui-slots'
import { projectFindings } from '../src/dashboard.ts'
import '../src/cyber.css'
import fixture from '../vendor/codex-security/examples/completed-scan/findings.json'

// 仅用于 UI 合约验证的合成数据。 Synthetic UI fixture; never a security scan result.
const workspace = 'C:/fixture/better-dsh'
const task = { id: 'fixture-task-20261111', sessionId: 'fixture-chat', workspace, status: 'completed', phase: 'reporting', model: 'fixture-model', provider: 'scripted-fixture', findings: 1, scope: 'src', scanId: 'fixture-scan', startedAt: '2026-11-11T07:52:00Z', updatedAt: '2026-11-11T07:55:00Z', usage: { inputTokens: 1500, outputTokens: 400, cacheReadTokens: 100, cacheWriteTokens: 0, calls: 3, unreportedCalls: 0 }, timeline: [{ phase: 'preflight', at: '2026-11-11T07:52:00Z' }, { phase: 'discovery', at: '2026-11-11T07:52:30Z' }, { phase: 'reporting', at: '2026-11-11T07:54:40Z' }] } as const
const details = { report: '# Synthetic fixture report\n\nThis is a browser contract test, not a model audit.', findings: JSON.stringify(fixture), threatModel: 'Synthetic fixture threat model.' }
const findings = projectFindings([{ task: task as any, details }])
let state: any = { workspace, tasks: [task], findings, warnings: [], capabilities: { findingStatusEditing: true }, selection: { provider: 'scripted-fixture', model: 'fixture-model', reasoningEffort: 'high' } }
let starts: any[] = [], cancels = 0, failStart = false, failRead = false, holdRead = false, failStatus = false
const statusWrites: any[] = []
let refreshes = 0, dashboardReads = 0, detailReads = 0
const openedConversations: string[] = []
let releaseRead: (() => void) | undefined
const remote = {
  async dashboard() { dashboardReads++; if (holdRead) await new Promise<void>(resolve => { releaseRead = resolve }); return failRead ? { ok: false, error: { message: 'Fixture connection lost' } } : { ok: true, value: structuredClone(state) } },
  async models() { return { ok: true, value: [{ provider: 'scripted-fixture', model: 'fixture-model', label: 'Fixture model', efforts: ['off', 'low', 'high', 'max'], ultra: true }, { provider: 'scripted-fixture', model: 'fixture-alternative', label: 'Alternative fixture model', efforts: ['medium'] }] } },
  async details() { detailReads++; return { ok: true, value: details } },
  async state() { return { ok: true, value: { workspace, task: state.tasks[0] ?? null } } },
  async start(request: any) {
    starts.push(request)
    if (failStart) return { ok: false, error: { message: 'Fixture start rejected' } }
    state.tasks.unshift({ ...task, id: 'fixture-running', conversationId: 'fixture-scan-conversation', status: 'running', phase: 'discovery', scope: request.scope, model: request.model, reasoningEffort: request.reasoningEffort, ultra: request.ultra, instructions: request.instructions, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    return { ok: true, value: { workspace, task: state.tasks[0] } }
  },
  async cancel() { cancels++; state.tasks[0].status = 'cancelled'; return { ok: true, value: { workspace, task: state.tasks[0] } } },
  async setFindingStatus(request: any) {
    statusWrites.push(request)
    if (failStatus) return { ok: false, error: { message: 'Fixture status save failed' } }
    state.findings = state.findings.map((finding: any) => finding.id === request.findingId ? { ...finding, status: request.status } : finding)
    return { ok: true, value: structuredClone(state) }
  },
}
let unmount: (() => void) | undefined, pluginFiber: any, nativeContext: any, renderer: any
let crashSessions = false
const sessionListeners = new Set<() => void>()
let catalog: any = { ids: ['fixture-chat'], byId: { 'fixture-chat': { id: 'fixture-chat', cwd: workspace } }, phase: 'ready', projectionsBySession: {} }
const sessionSource = { getSnapshot() { if (crashSessions) throw new Error('Synthetic session selector crash'); return catalog }, subscribe(callback: () => void) { sessionListeners.add(callback); return () => sessionListeners.delete(callback) } }
const primitives = new Proxy({}, { get: () => () => { throw new Error('Composer primitives are not rendered by the Cyber fixture') } })
const imports: Record<string, any> = { react: React, 'react/jsx-runtime': jsx, 'react-dom': ReactDOM, 'react-dom/client': ReactDOMClient,
  '@deepseek-ai/cordis': Cordis, '@deepseek-ai/dsh-client-ui-slots': slotCore, '@deepseek-ai/dsh-client-ui-primitives': primitives }
;(window as any).__ModuleLoader__ = { load({ id, factory }: any) {
  const module = factory((name: string) => { if (!(name in imports)) throw new Error(`Unmapped fixture module ${name}`); return imports[name] })
  if (id === '@deepseek-ai/dsh-client-ui-renderer') { renderer = module; return }
  ;(window as any).pluginReady = (async () => {
    const ctx = nativeContext = new Cordis.Context()
    const rendererFiber = ctx.plugin(renderer); await rendererFiber.await()
    ctx.provide('inputTriggers', { registerSource() { return () => {} } })
    ctx.provide('remote', { $mount: async () => {}, deepseekSecurity: remote })
    ctx.provide('remote.deepseekSecurity', remote)
    ctx.provide('layout', { panelInfo: { getSnapshot: () => ({ activePanelId: 'deepseek-security-cyber' }) }, selectPanel() {} })
    ctx.provide('sessions', { list: sessionSource, async refresh() {
      refreshes++
      if (refreshes < 2) return
      const conversationId = state.tasks[0]?.conversationId
      if (conversationId && !catalog.byId[conversationId]) {
        catalog = { ...catalog, ids: [...catalog.ids, conversationId], byId: { ...catalog.byId, [conversationId]: { id: conversationId, cwd: workspace } } }
        sessionListeners.forEach(callback => callback())
      }
    } })
    ctx.provide('uiWorkspace', { openSession(id: string) {
      if (!catalog.byId[id]) throw new Error(`Fixture navigation opened unknown session ${id}`)
      openedConversations.push(id)
    } })
    ctx.slots.provideRoot({ hooks: { sessions: sessionSource } })
    const emptyBinding = { props: {}, hooks: {}, keyedHooks: {} }
    const absent = { getSnapshot: () => emptyBinding, subscribe: () => () => {} }
    ctx.slots.installScope('session', { current: absent, bindingSource: () => absent, renderArea: () => null })
    ctx.slots.register({ name: 'root', children: { main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' }, 'conversation.input.dock': { kind: 'list', scope: 'session' } } },
      ({ renderSlot }: any) => renderSlot('main', {}, { entryKey: 'deepseek-security-cyber' }))
    pluginFiber = ctx.plugin(module); await pluginFiber.await()
    unmount = ctx.uiRenderer.mount(document.getElementById('root'))
  })()
} }
const loadScript = (src: string) => new Promise<void>((resolve, reject) => { const element = document.createElement('script'); element.src = src; element.onload = () => resolve(); element.onerror = () => reject(new Error(`Script failed: ${src}`)); document.head.append(element) })
void loadScript('/native-renderer.js').then(() => loadScript('/plugin.js'))
;(window as any).cyberFixture = {
  stats: () => ({ starts, cancels, refreshes, dashboardReads, detailReads, statusWrites, openedConversations, registrations: ['main', 'sidebar.panellist', 'conversation.input.dock'].flatMap(name => nativeContext.slots.entries(name).map((entry: any) => ({ ...entry.options, name }))) }),
  failStart: (value: boolean) => { failStart = value },
  failRead: (value: boolean) => { failRead = value },
  holdRead: (value: boolean) => { holdRead = value; if (!value) releaseRead?.() },
  crash: (value: boolean) => { crashSessions = value; sessionListeners.forEach(callback => callback()) },
  catalog: (value: any) => { catalog = value; sessionListeners.forEach(callback => callback()) },
  empty: () => { state = { ...state, tasks: [], findings: [] } },
  failStatus: (value: boolean) => { failStatus = value },
  legacyHost: (value: boolean) => { state.capabilities = value ? undefined : { findingStatusEditing: true } },
  distribution: () => { state.findings = Array.from({ length: 11 }, (_, index) => ({ ...findings[0], id: `distribution-${index}`, severity: index ? 'low' : 'medium', status: index ? 'new' : 'in_progress' })) },
  allStatuses: () => { state.findings = ['new', 'triaged', 'in_progress', 'fixed', 'wont_fix', 'duplicate', 'false_positive'].map((status, index) => ({ ...findings[0], id: `status-${index}`, status })) },
  resetFindings: () => { state.findings = findings },
  complete: () => { state.tasks[0] = { ...state.tasks[0], status: 'completed', phase: 'reporting', updatedAt: new Date().toISOString() }; state.findings = projectFindings([{ task: state.tasks[0], details }]) },
  stop: async () => { unmount?.(); await pluginFiber?.dispose(); await nativeContext?.fiber.dispose() },
}
