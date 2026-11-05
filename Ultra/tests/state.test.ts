import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, fold } from '../src/projection';
import { UltraState, UltraDirectory } from '../src/directory';
import { supportsUltra, emptyView } from '../src/contracts';

const route = { provider: 'deepseek', model: 'deepseek-test', reasoningEffort: 'max' };
const child = { id: 'child', runId: 'run', label: '检查', provider: route.provider, model: route.model, effort: 'max', status: 'running' };
const enabled = { ...emptyView, enabled: true, available: true, route, revision: 2 };
test('First own record, persistence replay, native model switch and malformed records', () => {
  let state = fold(initialState(), { seq: 0, type: 'plugin:ultra/mode', data: { enabled: true, route } });
  assert.equal(state.enabled, true);
  state = fold(state, { seq: 1, type: 'plugin:ultra/child', data: child });
  state = fold(JSON.parse(JSON.stringify(state)), { seq: 2, type: 'plugin:ultra/child', data: { ...child, status: 'completed' } });
  assert.equal(state.children.length, 1); assert.equal(state.children[0].status, 'completed');
  assert.equal(fold(state, { seq: 3, type: 'plugin:ultra/mode', data: { enabled: 'yes' } }), state);
  assert.equal(fold(state, { seq: 3, type: 'model/selection', data: route }).enabled, false);
});
test('Forks do not inherit parent mode or children; unrelated log events are no-ops', () => {
  const state = initialState(5);
  assert.equal(fold(state, { seq: 4, type: 'plugin:ultra/mode', data: { enabled: true, route } }), state);
  assert.equal(fold(state, { seq: 5, type: 'plugin:ultra/mode', data: { enabled: true, route } }).enabled, true);
  assert.equal(fold(state, { seq: 6, type: 'tool/result', data: {} }), state);
});
test('Ultra is offered only on DeepSeek models with real max support', () => {
  assert(supportsUltra({ id: 'deepseek' }, { id: 'model', reasoning: { efforts: [{ id: 'max' }] } }));
  assert(!supportsUltra({ id: 'qwen' }, { id: 'qwen', reasoning: { efforts: [{ id: 'max' }] } }));
  assert(!supportsUltra({ id: 'deepseek' }, { id: 'model', reasoning: { efforts: [{ id: 'high' }] } }));
});
function fixture(select?: any) {
  const callbacks = new Set<() => void>();
  let native = { current: route, pending: null, error: null, groups: [{ id: 'deepseek', models: [{ id: 'deepseek-test', name: 'DeepSeek', reasoning: { defaultEffort: 'high', efforts: [{ id: 'high', name: '高' }, { id: 'max', name: 'Max' }] } }] }] };
  const calls: any[] = [];
  const remote = { select: async (request: any) => { calls.push(request); return select ? select(request) : { ok: true, value: { ...enabled, enabled: request.ultra, route: request.ultra ? route : null, revision: 3 } }; } };
  const state = new UltraState(remote, 'parent'); state.accept({ ...enabled, enabled: false, revision: 1 });
  const base = { store: { subscribe: (fn: () => void) => { callbacks.add(fn); return () => callbacks.delete(fn); }, getSnapshot: () => native }, load: async () => native, select: async (selection: any) => { calls.push(selection); return { ok: true }; } };
  const directory = new UltraDirectory(base, state);
  return { state, directory, calls, publish: (current: any) => { native = { ...native, current }; callbacks.forEach(fn => fn()); } };
}
test('Virtual Ultra sends max over the host boundary and restores from confirmed state', async () => {
  const { state, directory, calls } = fixture();
  const efforts = directory.store.getSnapshot().groups[0].models[0].reasoning.efforts;
  assert.deepEqual(efforts.map((e: any) => e.id), ['high', 'max', 'ultra']);
  await directory.select({ ...route, reasoningEffort: 'ultra' });
  assert.equal(calls[0].selection.reasoningEffort, 'max'); assert.equal(calls[0].ultra, true);
  assert.equal(directory.store.getSnapshot().current.reasoningEffort, 'ultra');
  state.accept({ ...enabled, revision: 2, enabled: false });
  assert.equal(directory.store.getSnapshot().current.reasoningEffort, 'ultra');
  directory.dispose();
});
test('Selection failures leave the confirmed mode intact', async () => {
  const { directory } = fixture(() => ({ ok: false, error: { message: 'unavailable' } }));
  const result = await directory.select({ ...route, reasoningEffort: 'ultra' });
  assert.equal(result.ok, false); assert.equal(directory.store.getSnapshot().current.reasoningEffort, 'max');
  assert.equal(directory.store.getSnapshot().pending, null); directory.dispose();
});
test('Lagging native projections do not flash back; newer native selection exits Ultra', async () => {
  const { directory, state, publish } = fixture();
  await directory.select({ ...route, reasoningEffort: 'high' });
  assert.equal(directory.store.getSnapshot().current.reasoningEffort, 'high');
  publish({ ...route, reasoningEffort: 'high' });
  state.accept({ ...enabled, revision: 4 }); publish(route);
  assert.equal(directory.store.getSnapshot().current.reasoningEffort, 'ultra');
  state.accept({ ...enabled, enabled: false, route: null, revision: 5 });
  assert.equal(directory.store.getSnapshot().current.reasoningEffort, 'max'); directory.dispose();
});
test('Host capability loss removes virtual mode and cannot send ultra to base directory', async () => {
  const { state, directory, calls } = fixture(); state.accept({ ...enabled, available: false, revision: 5 });
  assert.equal(directory.store.getSnapshot().groups[0].models[0].reasoning.efforts.length, 2);
  assert.equal((await directory.select({ ...route, reasoningEffort: 'ultra' })).ok, false);
  assert.equal(calls.length, 0); directory.dispose();
});
test('Provider-owned Ultra on other models is not rewritten as the DeepSeek orchestration mode', async () => {
  const calls: any[] = [];
  const state = new UltraState({ select: async (request: any) => { calls.push(request); return { ok: true, value: { ...emptyView, available: true, revision: 1 } }; } }, 'parent');
  state.accept({ ...emptyView, available: true });
  const native = { current: null, pending: null, groups: [{ id: 'other-provider', models: [{ id: 'gpt', reasoning: { efforts: [{ id: 'max' }, { id: 'ultra' }] } }] }] };
  const base = { store: { subscribe: () => () => {}, getSnapshot: () => native } };
  const directory = new UltraDirectory(base, state);
  await directory.select({ provider: 'other-provider', model: 'gpt', reasoningEffort: 'ultra' });
  assert.equal(calls[0].ultra, false); assert.equal(calls[0].selection.reasoningEffort, 'ultra');
  directory.dispose();
});
