import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { builtins, config, makeSvg, readLibrary, sanitizeSvg, svgUrl, states } from './pets.mjs';

export function useStore(store) { return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot); }
export function Icon({ name }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'chat' ? <><path d="M13 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-7M15 3l6 6M10 14l2-5 6-6 3 3-6 6Z"/></> : name === 'voice' ? <><path d="M5 10v4m4-8v12m4-15v18m4-14v10m4-7v4"/></> : name === 'plus' ? <path d="M12 5v14M5 12h14"/> : name === 'close' ? <path d="m6 6 12 12M18 6 6 18"/> : <path d="m6 9 6 6 6-6"/>}</svg>;
}
export function Pet({ pet, size = 112, animated = true, status = 'idle' }) {
  return <img className={`pm-pet pm-${status}`} data-animated={animated} width={size} height={size} src={svgUrl(pet.svg)} alt={pet.name} draggable="false"/>;
}
export function MiniKeys({ onChat, onVoice, onMenu, disabled }) {
  return <div className="pm-mini-keys" role="group" aria-label="伙伴快捷操作">
    <button title="快速聊天" aria-label="快速聊天" onClick={onChat} disabled={disabled}><Icon name="chat"/></button>
    <button title="语音输入" aria-label="语音输入" onClick={onVoice} disabled={disabled}><Icon name="voice"/></button>
    <button title="通知与更多" aria-label="通知与更多" onClick={onMenu}><Icon name="menu"/></button>
  </div>;
}
function SizeControl({ size, disabled, onSave }) {
  const [value, setValue] = useState(size);
  useEffect(() => setValue(size), [size]);
  return <label><span>伙伴大小</span><input aria-label="伙伴大小" type="range" min="72" max="180" step="4" value={value} disabled={disabled} onChange={e => setValue(Number(e.target.value))} onPointerUp={() => { if (value !== size) onSave(value); }} onKeyUp={() => { if (value !== size) onSave(value); }} onBlur={() => { if (value !== size) onSave(value); }}/><span>{value}px</span></label>;
}
export function Creator({ initial, onSave, onCancel, onAi }) {
  const [name, setName] = useState(initial?.name || '我的新伙伴');
  const [description, setDescription] = useState(initial?.description || '一只戴眼镜的蓝色羊驼');
  const [kind, setKind] = useState('alpaca'), [color, setColor] = useState('#a6b6ff'), [accessory, setAccessory] = useState('glasses');
  const [mode, setMode] = useState(initial ? 'svg' : 'template');
  const [source, setSource] = useState(initial?.svg || makeSvg()), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('idle');
  let svg, issue = '';
  try { svg = mode === 'template' ? makeSvg({ kind, color, accessory }) : sanitizeSvg(source); } catch (e) { issue = e.message; }
  async function save(e) {
    e.preventDefault(); if (busy || issue) return;
    setBusy(true); setError('');
    try { await onSave({ id: initial?.id || `custom-${crypto.randomUUID()}`, name: name.trim(), description: description.trim(), svg: sanitizeSvg(svg) }); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <form className="pm-creator pm-card" onSubmit={save} aria-label={initial ? '编辑宠物' : '创建宠物'}>
    <div className="pm-row"><div><h3>{initial ? '编辑伙伴' : '创造你的伙伴'}</h3><p className="pm-muted">从一个小小的想法开始。</p></div><button type="button" aria-label="关闭创建器" onClick={onCancel}><Icon name="close"/></button></div>
    <div className="pm-create-grid"><div className="pm-create-preview"><Pet pet={{ name, svg: svg || makeSvg() }} size={160} status={status}/><select aria-label="预览动作" value={status} onChange={e => setStatus(e.target.value)}>{states.map((s, i) => <option key={s} value={s}>{['待机', '工作中', '等待', '完成', '出错'][i]}</option>)}</select></div>
    <div className="pm-fields"><label>伙伴名字<input required maxLength={48} value={name} onChange={e => setName(e.target.value)}/></label>
    <label>描述<textarea rows={2} maxLength={300} value={description} onChange={e => setDescription(e.target.value)}/></label>
    <div className="pm-segment" role="group" aria-label="创建方式"><button type="button" aria-pressed={mode === 'template'} onClick={() => setMode('template')}>模板捏宠</button><button type="button" aria-pressed={mode === 'svg'} onClick={() => { if (mode === 'template') setSource(svg); setMode('svg'); }}>SVG 编辑</button></div>
    {mode === 'template' ? <div className="pm-template"><label>形象<select value={kind} onChange={e => setKind(e.target.value)}><option value="alpaca">羊驼</option><option value="cat">猫咪</option><option value="robot">机器人</option><option value="drop">水滴</option></select></label><label>颜色<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label><label>配饰<select value={accessory} onChange={e => setAccessory(e.target.value)}><option value="glasses">眼镜</option><option value="scarf">围巾</option><option value="none">无</option></select></label></div>
    : <label>SVG 源码<textarea className="pm-code" rows={6} value={source} onChange={e => setSource(e.target.value)} spellCheck="false"/></label>}
    <button type="button" onClick={() => { try { onAi(description); } catch (e) { setError(e.message); } }}>让 DSH 设计 SVG</button>
    </div></div>
    {(issue || error) && <p role="alert">{issue || error}</p>}
    <div className="pm-actions"><button type="button" onClick={onCancel}>取消</button><button className="pm-primary" disabled={busy || !!issue || !name.trim()}>{busy ? '保存中…' : initial ? '保存修改' : '加入我的伙伴'}</button></div>
  </form>;
}
export function Settings({ manager }) {
  useEffect(() => { manager.setManagementVisible?.(true); return () => manager.setManagementVisible?.(false); }, [manager.store]);
  const state = useStore(manager.store), prefs = config(state.value), [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const file = useRef(null);
  let custom = [], issue = '';
  try { custom = readLibrary(prefs.library); } catch (e) { issue = e.message; }
  const pets = [...builtins, ...custom.filter(p => !p.archived)], selected = pets.find(p => p.id === prefs.selected);
  const readonly = busy || !state.writable || state.status !== 'ready' || !!issue;
  async function update(patch) { setBusy(true); setMessage(''); try { await manager.update(patch); } catch (e) { setMessage(e.message); throw e; } finally { setBusy(false); } }
  const act = patch => { void update(patch).catch(() => {}); };
  async function importFile(e) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try {
      if (f.size > 150000) throw new Error('文件过大，请使用 150 KB 以内的 SVG 或宠物 JSON');
      const text = await f.text();
      const p = /\.json$/i.test(f.name) ? JSON.parse(text) : { name: f.name.replace(/\.svg$/i, ''), svg: text };
      setEditing({ id: `custom-${crypto.randomUUID()}`, name: String(p.name || '导入的伙伴').slice(0, 48), description: String(p.description || '').slice(0, 300), svg: sanitizeSvg(p.svg) });
    } catch (e) { setMessage(e.message); }
  }
  function exportPet(pet) {
    const blob = new Blob([JSON.stringify({ format: 'dsh-svg-pet', version: 1, ...pet }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${pet.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="pm-root pm-settings" aria-label="迷你界面和伙伴">
    <header className="pm-row pm-heading"><div><h2>迷你界面和伙伴</h2><p className="pm-muted">一点陪伴，让专注更轻松。</p></div><button disabled={readonly} onClick={() => act({ enabled: !prefs.enabled })}>{prefs.enabled ? '隐藏 Mini' : '显示 Mini'}</button></header>
    <div className="pm-hero pm-card"><div className="pm-hero-companion">{selected && <Pet pet={selected} size={prefs.size} animated={prefs.animated}/>}<MiniKeys onChat={manager.chat} onVoice={manager.voice} onMenu={() => manager.toggleMenu()} disabled={!state.sessionAvailable}/></div><span className="pm-hero-label">{selected?.name || '轻量级伙伴'}</span></div>
    <div className="pm-options pm-card"><SizeControl size={prefs.size} disabled={readonly} onSave={size => act({ size })}/><label><span>播放动画</span><input type="checkbox" role="switch" checked={prefs.animated} disabled={readonly} onChange={e => act({ animated: e.target.checked })}/></label><label><span>跨应用桌面悬浮</span><input type="checkbox" role="switch" checked={prefs.desktop} disabled={readonly} onChange={e => act({ desktop: e.target.checked })}/></label></div>
    {state.error && <p role="alert">{state.error}</p>}
    {state.pendingTranscript && <label>保留的语音文字<textarea readOnly value={state.pendingTranscript} aria-label="保留的语音文字"/></label>}
    {state.desktopMessage && <p role="status">{state.desktopMessage}</p>}
    {state.status !== 'ready' || !state.writable ? <p role="status">{state.status !== 'ready' ? '正在读取 DSH 设置…' : '当前设置只读'}</p> : null}
    {(message || issue) && <p role="alert">{message || issue}</p>}
    <div className="pm-row pm-library-heading"><h3>我的伙伴</h3><div className="pm-actions"><button disabled={readonly} onClick={() => file.current.click()}>导入 SVG</button><button disabled={readonly} onClick={() => setEditing({})}><Icon name="plus"/> 创建伙伴</button></div></div>
    <input ref={file} type="file" accept=".svg,.json,image/svg+xml,application/json" hidden onChange={importFile}/>
    {editing && <Creator key={editing.id || 'new'} initial={editing.id ? editing : undefined} onCancel={() => setEditing(null)} onAi={manager.design} onSave={async pet => {
      const next = [...custom.filter(p => p.id !== pet.id), pet]; readLibrary(JSON.stringify(next));
      await update({ library: JSON.stringify(next), selected: pet.id }); setEditing(null);
    }}/>}
    <div className="pm-grid">
      <article className="pm-pet-card" data-selected={prefs.selected === 'none'}><button className="pm-select" disabled={readonly} aria-pressed={prefs.selected === 'none'} onClick={() => act({ selected: 'none' })}><div className="pm-card-art"><span className="pm-empty-art"><Icon name="chat"/><Icon name="voice"/><Icon name="menu"/></span></div><strong>无</strong><p className="pm-muted">只保留轻量级 Mini</p></button></article>
      {pets.map(pet => <article key={pet.id} className="pm-pet-card" data-selected={prefs.selected === pet.id}><button className="pm-select" disabled={readonly} aria-pressed={prefs.selected === pet.id} onClick={() => act({ selected: pet.id })}><div className="pm-card-art"><Pet pet={pet} size={104} animated={false}/></div><strong>{pet.name}</strong><p className="pm-muted">{pet.description}</p></button><div className="pm-card-actions"><button onClick={() => exportPet(pet)} aria-label={`导出 ${pet.name}`}>导出</button>{!pet.builtin && <><button disabled={readonly} onClick={() => setEditing(pet)}>编辑</button><button disabled={readonly} onClick={() => act({ library: JSON.stringify(custom.map(p => p.id === pet.id ? { ...p, archived: true } : p)), ...(prefs.selected === pet.id ? { selected: 'none' } : {}) })}>移入归档</button></>}</div></article>)}
    </div>
    {custom.some(p => p.archived) && <details className="pm-archive"><summary>已归档伙伴</summary>{custom.filter(p => p.archived).map(p => <div className="pm-row" key={p.id}><span>{p.name}</span><button disabled={readonly} onClick={() => act({ library: JSON.stringify(custom.map(row => row.id === p.id ? { ...row, archived: false } : row)) })}>恢复</button></div>)}</details>}
  </section>;
}
export function Mini({ manager }) {
  const state = useStore(manager.store), prefs = config(state.value), [position, setPosition] = useState({ x: 24, y: 24 });
  const drag = useRef(null);
  let pets = builtins;
  try { pets = [...builtins, ...readLibrary(prefs.library)]; } catch { /* 保留内置伙伴；Keep built-ins when the custom library is invalid. */ }
  const pet = pets.find(p => p.id === prefs.selected);
  if (!prefs.enabled || state.status !== 'ready' || state.managementVisible || state.nativeAvailable && state.voicePhase === 'idle' && !state.pendingTranscript) return null;
  return <aside className="pm-root pm-floating" style={{ right: position.x, bottom: position.y }} aria-label="DSH 轻量伙伴" onKeyDown={e => { if (e.key === 'Escape') manager.toggleMenu(false); }}>
    {state.menuOpen && <div className="pm-popover pm-card"><h3>伙伴动态</h3><p className="pm-muted">{state.activityLabel || '准备好陪你开始了'}</p>{state.notices.length ? state.notices.slice(-5).reverse().map(n => <p key={n.id}>{n.text}</p>) : <p className="pm-muted">暂时没有新通知</p>}<button onClick={() => manager.toggleMenu(false)}>收起</button></div>}
    {state.voicePhase !== 'idle' && <div className="pm-popover pm-card"><p role="status">{state.voicePhase === 'recording' ? '正在聆听…' : state.voicePhase === 'transcribing' ? '正在转成文字…' : '等待麦克风…'}</p><div className="pm-actions">{state.voicePhase === 'recording' && <button onClick={manager.finishVoice}>完成录音</button>}<button onClick={manager.cancelVoice}>取消</button></div></div>}
    {state.error && <div className="pm-popover pm-card" role="alert">{state.error}<button aria-label="关闭提示" onClick={() => manager.clearError()}><Icon name="close"/></button></div>}
    {state.pendingTranscript && <div className="pm-popover pm-card"><label>保留的语音文字<textarea readOnly value={state.pendingTranscript}/></label><button onClick={manager.clearTranscript}>已复制，收起</button></div>}
    <div className="pm-drag" title="拖动伙伴" onPointerDown={e => { if (e.button !== 0) return; drag.current = { clientX: e.clientX, clientY: e.clientY, ...position }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const d = drag.current; if (d) setPosition({ x: Math.max(8, Math.min(window.innerWidth - 180, d.x + d.clientX - e.clientX)), y: Math.max(8, Math.min(window.innerHeight - 220, d.y + d.clientY - e.clientY)) }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {pet && <Pet pet={pet} size={prefs.size} animated={prefs.animated} status={state.activity || 'idle'}/>}
    </div>
    <MiniKeys onChat={manager.chat} onVoice={manager.voice} onMenu={() => manager.toggleMenu()} disabled={!state.sessionAvailable}/>
  </aside>;
}
