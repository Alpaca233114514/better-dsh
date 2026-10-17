import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Settings } from '../src/settings.tsx'
import { css } from '../src/style.ts'
import { actions, defaultBindings, defaults } from '../src/actions.ts'
import type { Binding, CatalogRow, ConfigForm, Edit, Shortcuts } from '../src/contracts.ts'
function store<T>(value: T) { const listeners = new Set<() => void>(); return { getSnapshot: () => value, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }, set(next: T) { value = next; listeners.forEach(fn => fn()) } } }
const rows: CatalogRow[] = [
  ...actions.map(action => ({ id: action.id, label: action.label, aliases: ['DSHKey'], binding: defaultBindings(action.code)['web:windows']!, keys: ['Ctrl', 'Alt', 'Shift', action.code.replace('Key', '').replace('BracketLeft', '[').replace('BracketRight', ']')], modified: false, conflicts: [], issue: null })),
  ...[{ id: 'session.new', label: '新建会话', key: 'N' }, { id: 'session.search', label: '搜索会话', key: 'K' }, { id: 'session.rename', label: '重命名会话', key: 'G' }].map(row => ({ ...row, aliases: [], binding: { code: `Key${row.key}`, modifiers: ['control', 'alt'] as const }, keys: ['Ctrl', 'Alt', row.key], modified: false, conflicts: [], issue: null })),
]
const form: ConfigForm = Object.assign(store({ status: 'ready', writable: true, revision: 1, value: defaults }), {
  async mutate(ops: { path: string[]; value: unknown }[], revision?: number) {
    const current = form.getSnapshot(); if (revision !== current.revision) return false
    const value = { ...current.value, ...Object.fromEntries(ops.map(op => [op.path[0], op.value])) } as typeof defaults
    ;(form as any).set({ ...current, value, revision: current.revision! + 1 }); return true
  },
})
let revision = 1
const catalog = store<readonly CatalogRow[]>(rows)
const config = store({ status: 'ready' as const, revision: String(revision) })
const describe = (binding: Binding | null) => ({ binding, keys: binding ? [...binding.modifiers.map(key => ({ primary: 'Ctrl', control: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: '⌘' })[key]), binding.code.replace('Key', '')] : [], issue: binding && !binding.modifiers.length ? 'modifier-required' : null,
  conflicts: binding ? catalog.getSnapshot().filter(row => row.binding?.code === binding.code && row.binding.modifiers.map(m => m === 'primary' ? 'control' : m).sort().join() === [...binding.modifiers].map(m => m === 'primary' ? 'control' : m).sort().join()).map(row => row.id) : [] })
const shortcuts: Shortcuts = { runtime: 'web', platform: 'windows', catalog, config,
  fixedCatalog: store([{ id: 'fixed.send', label: '发送消息', keys: ['Enter'], group: 'input' }, { id: 'response.stop', label: '停止生成', keys: ['Esc', 'Esc'], group: 'input' }]),
  register: () => () => {}, recording: async () => {}, describeBinding: describe,
  async edit(edit: Edit, expected: string) {
    if (expected !== config.getSnapshot().revision) return { status: 'stale', snapshot: config.getSnapshot() }
    const original = rows.find(row => row.id === edit.id)!
    const binding = edit.type === 'reset' ? original.binding : edit.binding
    const description = describe(binding)
    if (description.issue || description.conflicts.some(id => id !== edit.id)) return { status: 'conflict', snapshot: config.getSnapshot() }
    catalog.set(catalog.getSnapshot().map(row => row.id !== edit.id ? row : { ...row, binding, keys: description.keys, modified: edit.type !== 'reset' }))
    config.set({ status: 'ready', revision: String(++revision) }); return { status: 'saved', snapshot: config.getSnapshot() }
  },
}
function App() {
  const [dark, setDark] = useState(false)
  return <div className="preview-shell" data-dark={dark}><aside><strong>设置</strong><span>通用</span><span className="selected">快捷键 · DSHKey</span><span>插件</span><div className="preview-note">开发预览 · 演示数据</div><button onClick={() => setDark(!dark)}>{dark ? '切换浅色' : '切换深色'}</button></aside><main><Settings form={form} shortcuts={shortcuts} /></main></div>
}
const style = document.createElement('style')
style.textContent = css + `body{margin:0;font-family:system-ui,sans-serif}.preview-shell{--dsw-alias-label-primary:#202125;--dsw-alias-label-secondary:#70737a;--dsw-alias-border-l2:#e3e4e8;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f6f7f9;--dsw-alias-bg-layer-3:#eceef2;--dsw-alias-state-business-primary:#4968da;background:#fff;color:#202125;min-height:100vh;display:grid;grid-template-columns:220px minmax(0,1fr)}.preview-shell[data-dark=true]{--dsw-alias-label-primary:#ebedf2;--dsw-alias-label-secondary:#a1a5b0;--dsw-alias-border-l2:#383b44;--dsw-alias-bg-layer-1:#202229;--dsw-alias-bg-layer-2:#2b2e37;--dsw-alias-bg-layer-3:#353944;background:#17191e;color:#ebedf2;color-scheme:dark}aside{background:var(--dsw-alias-bg-layer-2);padding:32px 16px;display:flex;flex-direction:column;gap:12px;border-right:1px solid var(--dsw-alias-border-l2)}aside strong{padding:0 12px 20px;font-size:18px}aside span{padding:10px 12px;border-radius:8px;font-size:14px}.selected{background:var(--dsw-alias-bg-layer-3);font-weight:600}.preview-note{font-size:12px;margin:30px 12px 0;color:var(--dsw-alias-label-secondary)}aside button{margin:0 12px;padding:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:8px;cursor:pointer}main{padding:36px 42px;max-width:1000px;width:100%;box-sizing:border-box}@media(max-width:700px){.preview-shell{display:block}aside{display:none}main{padding:24px 18px}}`
document.head.append(style)
createRoot(document.getElementById('root')!).render(<App />)
