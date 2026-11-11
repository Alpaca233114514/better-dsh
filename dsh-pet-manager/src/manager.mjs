import { builtins, config, readLibrary } from './pets.mjs';
import { Recording, audioBase64 } from '../vendor/dsh-audio.ts';
export function createStore(initial) {
  let snapshot = initial; const listeners = new Set();
  return { getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, set: patch => { snapshot = { ...snapshot, ...patch }; for (const fn of listeners) fn(); } };
}
export function createManager(ctx, form) {
  const store = createStore({ ...form.getSnapshot(), sessionAvailable: false, menuOpen: false, notices: [], voicePhase: 'idle', error: '', activity: 'idle', nativeAvailable: false, desktopMessage: '' });
  let disposed = false, saving = false, speech = null, capture = null, native = null, timer, currentStatus = '', voiceGeneration = 0;
  const owner = crypto.randomUUID(), seen = new Map();
  const set = patch => { if (!disposed) store.set(patch); };
  const error = e => set({ error: ({ permission: '麦克风权限未获允许', unavailable: '当前环境不支持录音', empty: '没有录到声音', interrupted: '录音已中断', deviceMissing: '找不到麦克风' })[e?.kind] || (e instanceof Error ? e.message : String(e)) });
  const current = () => {
    const rows = ctx.sessions.list.getSnapshot();
    const row = rows.current ? rows.byId[rows.current] : rows.ids.map(id => rows.byId[id]).find(row => row?.retainedBy?.mainView > 0);
    return row && ctx.sessions.binding(row.id);
  };
  const cancelVoice = () => {
    voiceGeneration++; clearTimeout(timer); const old = capture; capture = null;
    old?.abort.abort(); void old?.recording.dispose().catch(() => {}); set({ voicePhase: 'idle' });
  };
  const chat = () => {
    const binding = current(); if (!binding) throw new Error('请先在 DSH 打开一个会话');
    window.focus(); ctx.layout.selectPanel?.(null); ctx.conversation.input.for(binding.ctx).focus();
  };
  const finishVoice = async () => {
    const active = capture; if (!active || store.getSnapshot().voicePhase !== 'recording') return;
    clearTimeout(timer); set({ voicePhase: 'transcribing' });
    try {
      const bytes = await active.recording.stop(active.catalog.maxDurationSeconds);
      if (capture !== active) return;
      if (bytes.length > active.catalog.maxAudioBytes) throw new Error('录音超过 DSH 的大小限制，请缩短后重试');
      const raw = await active.service.transcribe({ audioBase64: audioBase64(bytes), ...active.catalog.selection }, active.abort.signal);
      const result = raw.result ?? raw;
      if (capture !== active) return;
      if (!result.ok) throw new Error(result.error.message);
      if (!result.value.text) throw new Error('没有听到清晰的语音，请重试');
      // 保持原会话和草稿修订；Never overwrite a draft edited during transcription.
      const span = { start: active.span.start, end: active.span.end, draftRev: active.span.draftRev };
      const inserted = active.binding.ctx.bail('slash/input-insert-text', { text: result.value.text, span });
      if (!inserted) { set({ pendingTranscript: result.value.text }); throw new Error('草稿已变化。识别文字已保留，可复制后粘贴。'); }
      if (ctx.uiWorkspace?.openSession) ctx.uiWorkspace.openSession(active.binding.sessionId); else ctx.sessions.open(active.binding.sessionId);
      ctx.conversation.input.for(active.binding.ctx).focus();
    } catch (e) { if (capture === active && !active.abort.signal.aborted) error(e); }
    finally { if (capture === active) { capture = null; set({ voicePhase: 'idle' }); } }
  };
  const voice = async () => {
    if (store.getSnapshot().voicePhase === 'recording') { await finishVoice(); return; }
    if (capture) return;
    try {
      if (!speech?.catalog) throw new Error('请先启用 DSH 内置「语音输入」插件，并在其设置中完成模型准备');
      const catalog = speech.catalog, provider = catalog.providers.find(p => p.id === catalog.selection.providerId);
      if (!provider || !['ready', 'standby', 'waking'].includes(provider.preparation.phase)) throw new Error('语音模型尚未就绪，请在 DSH 内置语音输入设置中准备模型');
      const binding = current(); if (!binding) throw new Error('请先打开会话，再开始语音输入');
      const input = ctx.conversation.input.for(binding.ctx), inputState = input.state.getSnapshot();
      if (inputState.phase !== 'plain') throw new Error('请先结束当前输入操作，再使用语音');
      const rev = inputState.draftRev;
      const draft = typeof inputState.draft === 'string' ? inputState.draft : inputState.draft?.text;
      if (!Number.isInteger(rev) || typeof draft !== 'string') throw new Error('当前 DSH 输入接口不支持安全插入语音文字');
      const recording = new Recording(() => {}), generation = ++voiceGeneration;
      const active = { binding, recording, catalog, service: speech.service, abort: new AbortController(), span: { start: draft.length, end: draft.length, draftRev: rev } };
      capture = active; set({ voicePhase: 'requesting', error: '', pendingTranscript: '' });
      await recording.start(e => { if (capture === active) { error(e); cancelVoice(); } });
      if (generation !== voiceGeneration || capture !== active) return;
      set({ voicePhase: 'recording' }); timer = setTimeout(() => void finishVoice(), Math.min(catalog.maxDurationSeconds, 120) * 1000);
    } catch (e) { error(e); cancelVoice(); }
  };
  const refresh = () => {
    const rows = ctx.sessions.list.getSnapshot(), now = Date.now(); let running = 0;
    for (const id of rows.ids) {
      const row = rows.byId[id]; if (!row || row.parentId) continue;
      if (row.running) running++;
      if (seen.get(id) === true && !row.running) {
        const notices = [...store.getSnapshot().notices, { id: `${id}-${now}`, text: `${row.title || '会话'}已停止运行，请查看结果` }].slice(-20);
        set({ notices, activity: 'completed' });
      }
      seen.set(id, row.running);
    }
    for (const id of seen.keys()) if (!rows.ids.includes(id)) seen.delete(id);
    set({ sessionAvailable: !!current(), activity: running ? 'running' : 'idle', activityLabel: running ? `${running} 个会话正在运行` : '准备好陪你开始了' });
  };
  const offForm = form.subscribe(() => set(form.getSnapshot())), offSessions = ctx.sessions.list.subscribe(refresh); refresh();
  const blur = () => { if (capture && store.getSnapshot().voicePhase !== 'transcribing') cancelVoice(); };
  const visibility = () => { if (document.hidden) blur(); };
  window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
  const manager = {
    store, chat: () => { try { chat(); } catch (e) { error(e); } }, voice: () => { void voice(); }, finishVoice: () => { void finishVoice(); }, cancelVoice,
    setManagementVisible: managementVisible => set({ managementVisible }),
    clearError: () => set({ error: '' }), clearTranscript: () => set({ pendingTranscript: '' }), toggleMenu: value => set({ menuOpen: value ?? !store.getSnapshot().menuOpen }),
    async update(patch) {
      if (saving) throw new Error('设置正在保存，请稍后重试');
      const state = form.getSnapshot(); if (state.status !== 'ready' || !state.writable) throw new Error('DSH 设置尚未就绪或只读');
      saving = true;
      try { const ok = await form.mutate(Object.entries(patch).map(([key, value]) => ({ op: 'set', path: [key], value })), state.revision); if (!ok) throw new Error('设置已被其他窗口更新，请重试'); }
      finally { saving = false; }
    },
    design(description) {
      const binding = current(); if (!binding) throw new Error('请先打开 DSH 会话');
      const input = ctx.conversation.input.for(binding.ctx), state = input.state.getSnapshot();
      if (state.draft && (typeof state.draft === 'string' ? state.draft : state.draft.text)) throw new Error('请先处理当前草稿，再创建设计请求');
      input.setDraft(`请为 dsh-pet-manager 设计一只 SVG 宠物：${description || '自由设计一只可爱的伙伴'}。\n返回一个完整 SVG，viewBox="0 0 128 128"，透明背景；只用 svg/g/path/circle/ellipse/rect/line/polyline/polygon/title/desc 和静态几何、颜色、transform 属性。不使用 style、script、事件、外链、image、use、foreignObject、url() 或动画。角色完整居中，下方留白。完成后我会将 SVG 粘贴进设置 → 迷你界面和伙伴 → SVG 编辑。`);
      chat();
    },
    setSpeech(service, catalog) { speech = catalog ? { service, catalog } : null; },
    setNative(service) { native = service; },
    async syncDesktop() {
      if (disposed || !native) return;
      const state = store.getSnapshot(), prefs = config(state.value);
      try {
        if (!prefs.desktop || !prefs.enabled || state.status !== 'ready') {
          if (currentStatus) { await native.run({ action: 'hide', owner }); currentStatus = ''; }
          set({ nativeAvailable: false }); return;
        }
        let pets = builtins; try { pets = [...pets, ...readLibrary(prefs.library)]; } catch {}
        const pet = pets.find(p => p.id === prefs.selected);
        const snapshot = { svg: pet?.svg || '', name: pet?.name || '', enabled: prefs.enabled, animated: prefs.animated, size: prefs.size, status: state.activity, dark: getComputedStyle(document.body).colorScheme.includes('dark'), text: state.error || (state.voicePhase !== 'idle' ? { recording: '正在聆听，再点语音结束', requesting: '等待麦克风…', transcribing: '正在转成文字…' }[state.voicePhase] : state.activityLabel), notices: state.notices.slice(-5).map(n => n.text) };
        const serialized = JSON.stringify(snapshot), changed = serialized !== currentStatus;
        const raw = await native.run({ action: changed ? 'sync' : 'poll', owner, ...(changed ? { state: snapshot } : {}) });
        const result = raw.result ?? raw;
        if (!result.ok) throw new Error(result.error.message);
        currentStatus = result.value.available ? serialized : '';
        set({ nativeAvailable: result.value.available, desktopMessage: result.value.message });
        for (const action of result.value.actions) if (action === 'chat') manager.chat(); else if (action === 'voice') manager.voice(); else manager.toggleMenu();
      } catch (e) { set({ nativeAvailable: false, desktopMessage: e.message }); currentStatus = ''; }
    },
    dispose() { disposed = true; cancelVoice(); offForm(); offSessions(); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); if (native && currentStatus) void native.run({ action: 'hide', owner }).catch(() => {}); },
  };
  return manager;
}
