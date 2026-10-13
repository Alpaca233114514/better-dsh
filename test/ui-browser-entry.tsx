// Integration fixture only. The actual plugin UI and upstream primitives render;
// RPC/config transport are deterministic doubles and never invoke a model.
import { SecurityProgress } from '../DeepSeekSecurity/src/progress-panel.tsx'
import { Settings } from './src/settings.tsx'

const settingsRoot = createRoot(document.getElementById('settings'))
const securityRoot = createRoot(document.getElementById('security'))
const configListeners = new Set()
let settingsState = { status: 'ready', writable: true, revision: 1, value: { language: 'zh' } }
let acceptSave = true, saveCount = 0
const settingsForm = {
  getSnapshot: () => settingsState,
  subscribe(fn) { configListeners.add(fn); return () => configListeners.delete(fn) },
  async mutate(ops, revision) {
    saveCount++
    await new Promise(resolve => setTimeout(resolve, 100))
    if (!acceptSave || revision !== settingsState.revision) return false
    settingsState = { ...settingsState, revision: revision + 1, value: Object.fromEntries(ops.map(op => [op.path[0], op.value])) }
    configListeners.forEach(fn => fn())
    return true
  },
}
const task = (changes = {}) => ({ id: 'scan', workspace: 'fixture', sessionId: 'chat-a', status: 'running',
  phase: 'threat_model', findings: 0, provider: 'fixture', model: 'fixture',
  startedAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z', ...changes })
let currentTask = null, sessionId = 'chat-a', cancelCount = 0, cancelFails = false, readFails = false
let releaseCancel
const response = () => ({ ok: true, value: { workspace: 'fixture', task: currentTask } })
const remote = {
  async state() { return readFails ? { ok: false, error: { message: '连接已断开' } } : response() },
  async cancel() {
    cancelCount++
    await new Promise(resolve => { releaseCancel = resolve })
    if (cancelFails) return { ok: false, error: { message: '停止失败，请重试' } }
    currentTask = task({ status: 'cancelled' })
    return response()
  },
}
const renderSecurity = () => securityRoot.render(React.createElement(SecurityProgress, { key: sessionId, sessionId, remote }))
const renderSettings = () => settingsRoot.render(React.createElement(Settings, { form: settingsForm }))
renderSecurity(); renderSettings()
window.ui = {
  phase(phase) { currentTask = task({ phase }) },
  finish(status) { currentTask = task({ status }) },
  session(id) { sessionId = id; renderSecurity() },
  readFailure(value) { readFails = value },
  cancelFailure(value) { cancelFails = value },
  resolveCancel() { releaseCancel?.() },
  saveFailure(value) { acceptSave = !value },
  writable(value) { settingsState = { ...settingsState, writable: value }; configListeners.forEach(fn => fn()) },
  leaveSettings() { settingsRoot.render(null) },
  returnSettings() { renderSettings() },
  stats() { return { cancelCount, saveCount, settingsState, subscribers: configListeners.size } },
  stop() { securityRoot.unmount(); settingsRoot.unmount() },
}
