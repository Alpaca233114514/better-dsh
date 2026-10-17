import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { actions, preferences } from './actions.ts'
import type { Binding, CatalogRow, ConfigForm, Edit, Observable, Preferences, Shortcuts } from './contracts.ts'

function useSnapshot<T>(source: Observable<T>): T {
  return useSyncExternalStore(useCallback(fn => source.subscribe(fn), [source]),
    useCallback(() => source.getSnapshot(), [source]), useCallback(() => source.getSnapshot(), [source]))
}
const issueLabels: Record<string, string> = {
  reserved: '这个组合键由系统或输入框保留', 'unsupported-browser': '当前浏览器不支持这个组合键',
  'modifier-required': '请加入 Ctrl、⌘ 或 Alt 修饰键', 'unsupported-key': '不支持这个按键',
  stale: '设置已在其他窗口更新，请关闭编辑后重试', unreadable: '无法读取快捷键配置',
  'write-failed': '保存失败，请检查连接或存储权限后重试', 'not-ready': '快捷键配置尚未就绪',
  conflict: '组合键与其他动作冲突',
}
export function failureMessage(status: string): string { return issueLabels[status] ?? `操作失败：${status}` }
export function Keycaps({ keys }: { keys: readonly string[] }) {
  return <span className="dk-keys">{keys.length ? keys.map((key, i) => <kbd key={`${i}-${key}`}>{key}</kbd>) : <span className="dk-muted">未绑定</span>}</span>
}

function Editor({ row, shortcuts, close }: { row: CatalogRow; shortcuts: Shortcuts; close(): void }) {
  const config = useSnapshot(shortcuts.config)
  const catalog = useSnapshot(shortcuts.catalog)
  const fixed = useSnapshot(shortcuts.fixedCatalog)
  const [revision] = useState(config.revision)
  const [candidate, setCandidate] = useState<Binding | null>(row.binding)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [ready, setReady] = useState(false)
  const recorder = useRef<HTMLButtonElement>(null)
  const saving = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!recording) return
    let disposed = false
    void shortcuts.recording(true).then(() => {
      if (!disposed) { setReady(true); recorder.current?.focus() }
    }, () => { if (!disposed) { setMessage('无法启用键位录制，请重试'); setRecording(false) } })
    return () => { disposed = true; void shortcuts.recording(false).catch(() => {}) }
  }, [recording, shortcuts])
  const description = shortcuts.describeBinding(candidate)
  const conflicts = description.conflicts.filter(id => id !== row.id)
  const conflictLabels = conflicts.map(id => [...catalog, ...fixed].find(item => item.id === id)?.label ?? id)
  const stale = revision !== config.revision
  const invalid = description.issue !== null || conflicts.length > 0
  async function save(edit: Edit) {
    if (saving.current || stale || config.status !== 'ready') return
    saving.current = true; setBusy(true); setMessage(''); setRecording(false); setReady(false)
    try {
      const result = await shortcuts.edit(edit, revision)
      if (!alive.current) return
      if (result.status === 'saved') close()
      else setMessage(failureMessage(result.issue ?? result.status))
    } catch { if (alive.current) setMessage('保存失败，请重试') }
    finally { saving.current = false; if (alive.current) setBusy(false) }
  }
  return <div className="dk-editor" role="group" aria-label={`编辑 ${row.label}`} aria-busy={busy} data-shortcut-modal="shortcut-edit">
    <div className="dk-editor-main">
      <button ref={recorder} type="button" className="dk-recorder" aria-label="录制组合键" disabled={busy}
        onClick={() => { setMessage(''); if (!recording) { setReady(false); setRecording(true) } }}
        onBlur={() => { setRecording(false); setReady(false) }}
        onKeyDown={event => {
          if (!recording || !ready) return
          if (event.key === 'Tab') return
          event.preventDefault(); event.stopPropagation()
          if (event.key === 'Escape') { setRecording(false); setReady(false); return }
          if (event.repeat || event.nativeEvent.isComposing || event.key === 'Process' || event.key === 'Dead'
            || event.nativeEvent.keyCode === 229 || event.getModifierState('AltGraph')
            || /^(Control|Alt|Shift|Meta)(Left|Right)$/.test(event.code)) return
          try {
            const modifiers = (['control', 'alt', 'shift', 'meta'] as const).filter(key => ({ control: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey })[key])
            const next = shortcuts.describeBinding({ code: event.code, modifiers }).binding
            setCandidate(next); setMessage(''); setRecording(false); setReady(false)
          } catch (error) { setMessage(`无法录制 ${event.code || event.key}：${error instanceof Error ? error.message : '不支持这个按键'}`) }
        }}>
        {recording ? (ready ? '请按下组合键…' : '准备录制…') : <Keycaps keys={description.keys} />}
      </button>
      <span className="dk-muted">点击录制 · Esc 取消</span>
    </div>
    {description.issue && <p role="alert">{failureMessage(description.issue)}</p>}
    {conflicts.length > 0 && <p role="alert">与「{conflictLabels.join('、')}」冲突，请换一个组合键。</p>}
    {/* DSH may publish our accepted revision before edit() resolves. Classify it only after the reply. */}
    {stale && !busy && <p role="alert">{failureMessage('stale')}</p>}
    {message && <p role="alert">{message}</p>}
    <div className="dk-actions">
      <button className="dk-primary" disabled={busy || stale || invalid || config.status !== 'ready'} onClick={() => void save({ type: 'set', id: row.id, binding: candidate })}>{busy ? '保存中…' : '保存键位'}</button>
      <button disabled={busy || stale || config.status !== 'ready'} onClick={() => void save({ type: 'set', id: row.id, binding: null })}>解除绑定</button>
      <button disabled={busy || stale || config.status !== 'ready'} onClick={() => void save({ type: 'reset', id: row.id })}>恢复默认</button>
      <button disabled={busy} onClick={close}>取消</button>
    </div>
  </div>
}

export function Settings({ form, shortcuts }: { form: ConfigForm; shortcuts: Shortcuts }) {
  const state = useSnapshot(form)
  const config = useSnapshot(shortcuts.config)
  const catalog = useSnapshot(shortcuts.catalog)
  const fixed = useSnapshot(shortcuts.fixedCatalog)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const saving = useRef(false)
  const value = preferences(state.value)
  const query = search.trim().toLowerCase()
  const rows = catalog.filter(row => (!query || `${row.label} ${row.id} ${row.aliases.join(' ')} ${row.keys.join(' ')}`.toLowerCase().includes(query))
    && (filter === 'all' || (filter === 'dshkey' ? row.id.startsWith('dshkey.') : row.modified)))
  async function update(field: keyof Preferences, next: boolean) {
    if (saving.current || state.status !== 'ready' || !state.writable) return
    saving.current = true; setBusy(true); setMessage('')
    try {
      const ok = await form.mutate([{ op: 'set', path: [field], value: next }], state.revision)
      setMessage(ok ? '设置已保存' : '未保存，配置可能已更新，请重试')
    } catch { setMessage('保存失败，请检查 DSH 连接后重试') }
    finally { saving.current = false; setBusy(false) }
  }
  return <section className="dk-root" aria-label="DSHKey 快捷键设置">
    <header className="dk-header"><div><span className="dk-eyebrow">DSHKey</span><h2>快捷键</h2><p className="dk-muted">让常用操作触手可及。</p></div><span className="dk-badge">{shortcuts.runtime === 'desktop' ? '桌面端' : 'Web'} · {shortcuts.platform === 'macos' ? 'macOS' : shortcuts.platform === 'windows' ? 'Windows' : 'Linux'}</span></header>
    <div className="dk-card dk-options">
      {([['enabled', '启用扩展快捷键'], ['sameWorkspace', '仅切换当前工作区会话'], ['wrapSessions', '循环切换会话']] as const).map(([field, label]) =>
        <label key={field} className="dk-option"><span>{label}</span><input type="checkbox" role="switch" checked={value[field]} disabled={busy || state.status !== 'ready' || !state.writable} onChange={e => void update(field, e.target.checked)} /></label>)}
    </div>
    {state.status !== 'ready' ? <p role="status">插件设置尚未就绪，扩展动作暂不启用。</p> : !state.writable && <p role="status">当前连接的插件设置只读。</p>}
    {message && <p role="status">{message}</p>}
    <div className="dk-toolbar"><input type="search" aria-label="搜索快捷键" placeholder="搜索动作或快捷键…" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="筛选快捷键" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部动作</option><option value="dshkey">DSHKey 扩展</option><option value="modified">已修改</option></select></div>
    {config.status !== 'ready' && <p role="alert">{config.status === 'loading' ? '正在读取键位…' : '无法读取键位，暂时不能修改。'}</p>}
    <div className="dk-card">{rows.map(row => <div className="dk-item" key={row.id}>
      <div className="dk-row"><div><div className="dk-label">{row.label}{row.modified && <span className="dk-dot" title="已修改" aria-label="已修改" />}</div>
        <span className="dk-meta">{actions.find(action => action.id === row.id)?.group ?? 'DSH 原生'}</span></div>
        <button className="dk-binding" aria-label={`修改 ${row.label} 快捷键`} disabled={config.status !== 'ready'} onClick={() => setEditing(editing === row.id ? undefined : row.id)}><Keycaps keys={row.keys} /></button></div>
      {(row.issue || row.conflicts.length > 0) && <p role="status">{row.issue ? failureMessage(row.issue) : '此键位存在冲突，暂不可用'}</p>}
      {editing === row.id && <Editor row={row} shortcuts={shortcuts} close={() => setEditing(undefined)} />}
    </div>)}{rows.length === 0 && <p className="dk-empty">没有匹配的快捷键。</p>}</div>
    {filter === 'all' && <details className="dk-fixed"><summary>原生固定按键 <span className="dk-muted">{fixed.length}</span></summary>
      {fixed.filter(row => !query || row.label.toLowerCase().includes(query)).map(row => <div className="dk-row" key={row.id}><span>{row.label}</span><Keycaps keys={row.keys} /></div>)}</details>}
    <p className="dk-footer">键位随当前设备保存。新增动作默认使用 {shortcuts.platform === 'macos' ? '⌘' : 'Ctrl'} + Alt + Shift；Linux 请按宿主支持的组合自行绑定。</p>
  </section>
}
