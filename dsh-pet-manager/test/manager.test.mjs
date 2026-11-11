import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const code = await build({ entryPoints: ['src/manager.mjs'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'microphone-fixture', setup(b) {
  b.onLoad({ filter: /dsh-audio\.ts$/ }, () => ({ contents: 'export class Recording { constructor(){this.inner = globalThis.newPetRecording();} start(fn){return this.inner.start(fn)} stop(n){return this.inner.stop(n)} dispose(){return this.inner.dispose()} } export const audioBase64=bytes=>Buffer.from(bytes).toString("base64");', loader: 'js' }));
} }] });
const { createStore, createManager } = await import(`data:text/javascript;base64,${Buffer.from(code.outputFiles[0].text).toString('base64')}`);
function bench() {
  const browser = new EventTarget(); browser.focus = () => {};
  globalThis.window = browser; globalThis.document = new EventTarget(); document.hidden = false;
  globalThis.getComputedStyle = () => ({ colorScheme: 'light' });
  const form = createStore({ status: 'ready', writable: true, revision: 1, value: {} });
  let mutations = [], focused = 0, disposed = 0, prompt = '', complete;
  form.mutate = async (ops, revision) => { mutations.push({ ops, revision }); return true; };
  const input = { state: createStore({ phase: 'plain', draft: '已有草稿', draftRev: 2 }), setDraft: text => { prompt = text; }, focus: () => focused++ };
  const binding = { sessionId: 'session-a', ctx: { bail: (_event, req) => { if (req.span.draftRev !== input.state.getSnapshot().draftRev) return; prompt = req.text; return true; } } };
  const list = createStore({ ids: ['session-a'], byId: { 'session-a': { id: 'session-a', retainedBy: { mainView: 1 }, running: false } } });
  const ctx = { sessions: { list, binding: () => binding }, conversation: { input: { for: () => input } }, uiWorkspace: { openSession: id => assert.equal(id, 'session-a') }, layout: { selectPanel: () => {} } };
  globalThis.newPetRecording = () => ({ start: async () => {}, stop: async () => new Uint8Array([1, 2]), dispose: async () => { disposed++; } });
  const manager = createManager(ctx, form);
  const catalog = { providers: [{ id: 'builtin', preparation: { phase: 'ready' } }], selection: { providerId: 'builtin', language: 'zh' }, maxDurationSeconds: 60, maxAudioBytes: 1000 };
  const service = { transcribe: (_request, signal) => new Promise(resolve => { complete = value => { assert.equal(signal.aborted, false); resolve({ ok: true, value: { text: value } }); }; }) };
  manager.setSpeech(service, catalog);
  return { manager, input, form, list, mutations, complete: value => complete(value), prompt: () => prompt, disposed: () => disposed, focused: () => focused };
}
const settle = () => new Promise(r => setTimeout(r, 0));
test('settings mutations use current Host revision and surface rejected writes', async () => {
  const b = bench();
  try {
    await b.manager.update({ selected: 'cat' }); assert.deepEqual(b.mutations[0], { ops: [{ op: 'set', path: ['selected'], value: 'cat' }], revision: 1 });
    b.form.mutate = async () => false;
    await assert.rejects(b.manager.update({ enabled: false }), /其他窗口/);
    b.form.set({ writable: false }); await assert.rejects(b.manager.update({ enabled: false }), /只读/);
  } finally { b.manager.dispose(); }
});
test('native voice pipeline inserts into captured Session without submitting', async () => {
  const b = bench();
  try {
    b.manager.voice(); await settle(); assert.equal(b.manager.store.getSnapshot().voicePhase, 'recording');
    b.manager.finishVoice(); await settle(); b.complete('语音文字'); await settle();
    assert.equal(b.prompt(), '语音文字'); assert.equal(b.focused(), 1); assert.equal(b.manager.store.getSnapshot().voicePhase, 'idle');
  } finally { b.manager.dispose(); }
});
test('transcription preserves results on draft revision conflict and releases cancellation', async () => {
  const b = bench();
  try {
    b.manager.voice(); await settle(); b.manager.finishVoice(); await settle();
    b.input.state.set({ draftRev: 3 }); b.complete('仍然保留'); await settle();
    assert.equal(b.prompt(), ''); assert.equal(b.manager.store.getSnapshot().pendingTranscript, '仍然保留');
    b.manager.voice(); await settle(); b.manager.cancelVoice(); assert.equal(b.disposed(), 1);
  } finally { b.manager.dispose(); }
});
test('late microphone permission after cancellation cannot restart recording', async () => {
  const b = bench(); let grant;
  globalThis.newPetRecording = () => ({ start: () => new Promise(r => { grant = r; }), dispose: async () => {}, stop: async () => new Uint8Array() });
  try {
    b.manager.voice(); assert.equal(b.manager.store.getSnapshot().voicePhase, 'requesting');
    b.manager.cancelVoice(); grant(); await settle(); assert.equal(b.manager.store.getSnapshot().voicePhase, 'idle');
  } finally { b.manager.dispose(); }
});
test('AI design leaves existing drafts untouched and native running transition is not claimed as success', () => {
  const b = bench();
  try {
    assert.throws(() => b.manager.design('蓝色羊驼'), /草稿/); assert.equal(b.prompt(), '');
    b.input.state.set({ draft: '' }); b.manager.design('蓝色羊驼'); assert.match(b.prompt(), /蓝色羊驼/);
    b.list.set({ byId: { 'session-a': { id: 'session-a', retainedBy: { mainView: 1 }, running: true } } });
    b.list.set({ byId: { 'session-a': { id: 'session-a', retainedBy: { mainView: 1 }, running: false } } });
    assert.match(b.manager.store.getSnapshot().notices[0].text, /停止运行/);
  } finally { b.manager.dispose(); }
});
