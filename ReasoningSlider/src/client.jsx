import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import css from './style.css';
import effectPolicy from './effect-policy.cjs';

export const inject = ['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'];

const STEP_KEYS = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -1, PageUp: 1 };
const isMaxEffort = effectPolicy.isEmphasized;
const SPARKS = Array.from({ length: 20 }, (_, i) => ({
  left: `${12 + (i * 37 % 83)}%`, top: `${19 + (i * 29 % 64)}%`,
  '--delay': `${-(i * .31)}s`, '--duration': `${2.1 + (i % 4) * .3}s`,
  '--size': `${i % 4 === 0 ? 3.4 : 2.2}px`,
}));

// 点击和拖动都按中点分界吸附到最近档位。 Snap clicks and drags at stop midpoints.
function Range({ levels, value, label, disabled, onPreview, onCommit, onCancel }) {
  const root = useRef(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const max = Math.max(0, levels.length - 1);
  const index = Math.min(max, Math.max(0, Math.round(value)));
  const fraction = max === 0 ? 0 : index / max;
  const stepDisabled = disabled || levels.length < 2;
  const maxEffect = isMaxEffort(levels[index], levels) && Math.abs(value - index) < .02;
  const previousMax = useRef(maxEffect);
  const [revealMax, setRevealMax] = useState(false);
  const [leavingMax, setLeavingMax] = useState(false);
  const maxFraction = useRef(fraction);
  const exitTimer = useRef(null);
  // 初次打开直接显示已有 Max，仅切入 Max 时展开。 Reveal only on entering Max, never on mount.
  useLayoutEffect(() => {
    if (maxEffect) {
      clearTimeout(exitTimer.current);
      maxFraction.current = fraction;
      setLeavingMax(false);
    } else if (previousMax.current) {
      clearTimeout(exitTimer.current);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setLeavingMax(!reduced);
      if (!reduced) exitTimer.current = setTimeout(() => setLeavingMax(false), 420);
    }
    setRevealMax(maxEffect && !previousMax.current);
    previousMax.current = maxEffect;
  }, [maxEffect, fraction]);
  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const position = event => {
    const el = root.current;
    if (!el || max === 0) return 0;
    const rect = el.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(el).getPropertyValue('--rs-thumb')) || 34;
    const usable = Math.max(1, rect.width - thumb);
    return Math.round(Math.min(max, Math.max(0, (event.clientX - rect.left - thumb / 2) / usable * max)));
  };
  const down = event => {
    if (stepDisabled || event.button !== 0) return;
    event.preventDefault();
    dragging.current = true;
    setActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    onPreview(position(event));
  };
  const move = event => {
    if (!dragging.current) return;
    onPreview(position(event));
  };
  const up = event => {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    const next = Math.round(position(event));
    onPreview(next);
    onCommit(next);
  };
  const cancel = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    onCancel();
  };
  const key = event => {
    if (stepDisabled) return;
    const step = STEP_KEYS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      onCommit(Math.min(max, Math.max(0, index + step)));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      onCommit(event.key === 'Home' ? 0 : max);
    }
  };
  return <div ref={root} className="rs-slider" role="slider" tabIndex={stepDisabled ? -1 : 0}
    aria-label="推理强度" aria-orientation="horizontal" aria-disabled={stepDisabled || undefined}
    aria-valuemin={0} aria-valuemax={max} aria-valuenow={index} aria-valuetext={label}
    data-dragging={active || undefined} style={{ '--v': fraction }}
    onPointerDown={down} onPointerMove={move} onPointerUp={up}
    onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={key}>
    <span className="rs-track" aria-hidden="true">
      <span className="rs-fill" />
      {(maxEffect || leavingMax) && <span className="rs-max-field" style={{ '--max-v': maxEffect ? fraction : maxFraction.current }} data-exit={leavingMax || undefined} data-reveal={revealMax || undefined}>
        <span className="rs-max-glow" />
        {SPARKS.map((style, i) => <i key={i} className="rs-spark" style={style} />)}
      </span>}
      <span className="rs-ticks">{levels.map((level, i) => <i key={level.id ?? 'default'} className={i <= index ? 'on' : ''} />)}</span>
    </span>
    <span className="rs-thumb" aria-hidden="true" />
  </div>;
}

function Slider({ directory, available, locked }) {
  const state = useSyncExternalStore(fn => directory.store.subscribe(fn), () => directory.store.getSnapshot());
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [drag, setDrag] = useState(null);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ visibility: 'hidden' });
  const [placed, setPlaced] = useState(false);
  const trigger = useRef(null), panel = useRef(null);
  const submitting = useRef(false), settle = useRef(0);
  const choices = state.groups.flatMap(group => group.models.map(model => ({ group, model })));
  const current = choices.find(c => c.group.id === state.current?.provider && c.model.id === state.current?.model);
  const reasoning = current?.model.reasoning;
  const levels = reasoning ? [
    ...(reasoning.defaultEffort === undefined ? [{ id: undefined, name: '默认' }] : []),
    ...reasoning.efforts,
  ] : [];
  const effective = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
  const selected = levels.findIndex(level => level.id === effective);
  const value = drag ?? Math.max(0, selected);
  const index = levels.length ? Math.min(levels.length - 1, Math.max(0, Math.round(value))) : 0;
  const label = levels.length ? (levels[index]?.name ?? '') : (current ? '无推理档位' : '选择模型');
  const busy = state.pending !== null || locked || !available;
  useEffect(() => { if (available) directory.load().catch(e => setError(e.message)); }, [directory, available]);
  useEffect(() => { setDrag(null); clearTimeout(settle.current); }, [state.current?.provider, state.current?.model, effective]);
  useEffect(() => () => clearTimeout(settle.current), []);
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!panel.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false); };
    const escape = e => { if (e.key === 'Escape') { if (picking && current) setPicking(false); else { setOpen(false); trigger.current?.focus(); } } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, picking, Boolean(current)]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current.getBoundingClientRect(), p = panel.current;
      setPosition({ left: Math.max(12, Math.min(r.right - p.offsetWidth, innerWidth - p.offsetWidth - 12)),
        top: Math.max(12, r.top - p.offsetHeight - 12) });
      setPlaced(true);
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(panel.current);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  async function select(selection) {
    if (submitting.current) return;
    clearTimeout(settle.current);
    submitting.current = true;
    setError('');
    try {
      const result = await directory.select(selection);
      if (!result.ok) { setError(result.error.message); setDrag(null); }
    } catch (e) { setError(e.message); setDrag(null); }
    // 等宿主投影确认后再交还显示值，避免回包与投影之间闪回旧档。 Keep preview until projection confirms.
    finally { submitting.current = false; }
  }
  function choose(next) {
    if (busy || !current || !levels[next]) { setDrag(null); return; }
    setDrag(next);
    if (next === selected) {
      // Hold the settled stop until the ease completes, then hand control back
      // to the authoritative selection.
      clearTimeout(settle.current);
      settle.current = setTimeout(() => setDrag(null), 420);
      return;
    }
    select({ provider: current.group.id, model: current.model.id,
      ...(levels[next].id === undefined ? {} : { reasoningEffort: levels[next].id }) });
  }
  function reset() {
    if (!current || busy) return;
    const target = levels.findIndex(level => level.id === reasoning?.defaultEffort);
    if (target >= 0) setDrag(target);
    // 以宿主默认值重建选择，不沿用旧档位。 Rebuild selection from the host default.
    return select({ provider: current.group.id, model: current.model.id,
      ...(reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: reasoning.defaultEffort }) });
  }
  return <>
    <button ref={trigger} className="rs-trigger" disabled={!available || locked} aria-label="推理滑条" aria-expanded={open}
      onClick={() => { setOpen(!open); setPicking(!current); }}>
      {current?.model.name ?? '请选择模型'} <span className="rs-trigger-level" data-max={isMaxEffort(levels[selected], levels) || undefined}>{current && (levels[selected]?.name ?? '')}</span>
      <svg className="rs-trigger-chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
        <path d="m2.5 4.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {open && createPortal(<section ref={panel} className={`rs-panel${placed ? ' rs-in' : ''}`} data-picking={picking || undefined} data-saving={state.pending !== null || undefined} data-max={isMaxEffort(levels[index], levels) || undefined} style={position} aria-label="推理设置">
      <div className="rs-view" data-active={!picking || undefined} aria-hidden={picking || undefined} inert={picking ? '' : undefined}><div className="rs-view-inner">
      <button className="rs-reset" title="重置为默认设置" aria-label="重置为默认设置" disabled={!levels.length || busy} onClick={reset}>
        <svg viewBox="0 0 24 24"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></svg>
      </button>
      <span className="rs-level" aria-hidden="true"><span className="rs-level-text">{label}</span></span>
      <button className="rs-model" aria-expanded={picking} onClick={() => setPicking(!picking)}>
        <span className="rs-model-name">{current?.model.name ?? '选择模型'}</span><span className="rs-chev" aria-hidden="true">›</span>
      </button>
      {levels.length > 0 && <Range levels={levels} value={value} label={label} disabled={busy}
        onPreview={setDrag} onCommit={choose} onCancel={() => setDrag(null)} />}
      </div></div>
      <div className="rs-view" data-active={picking || undefined} aria-hidden={!picking || undefined} inert={!picking ? '' : undefined}><div className="rs-view-inner">
      <button className="rs-picker-back" onClick={() => { setPicking(false); }} aria-label="返回推理强度">‹ <span>选择模型</span></button>
      <div className="rs-models">{state.groups.map(group => <div className="rs-group" key={group.id}><small>{group.name}</small>{group.models.map(model => <button key={model.id} disabled={busy} aria-current={model.id === current?.model.id && group.id === current?.group.id}
        onClick={() => {
          select({provider:group.id,model:model.id,...(model.reasoning?.defaultEffort === undefined ? {} : {reasoningEffort:model.reasoning.defaultEffort})}); setPicking(false);
        }}><span>{model.name}</span>{model.id === current?.model.id && group.id === current?.group.id && <span aria-hidden="true">✓</span>}</button>)}</div>)}{state.status === 'loading' && <p>加载中…</p>}{!choices.length && state.status !== 'loading' && <p>暂无可用模型</p>}</div>
      </div></div>
      {(error || state.error) && <p className="rs-error" role="alert">{error || state.error}</p>}
    </section>, document.body)}
  </>;
}

export function apply(ctx) {
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); return () => style.remove(); });
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model', priority: -10,
    inject: sessionId => ({ directory: ctx.modelDirectories.directoryFor(sessionId), available: ctx.sessions.subagentAddress(sessionId) === undefined }),
  }, Slider));
  ctx.inject?.(['ultra', 'remote.dshUltra'], scope => scope.slots.inject('conversation.input.model', () => scope.slots.register({
    name: 'conversation.input.model', priority: -20,
    inject: sessionId => ({ directory: scope.ultra.directoryFor(sessionId), available: scope.sessions.subagentAddress(sessionId) === undefined }),
  }, Slider)));
}
