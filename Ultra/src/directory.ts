import { emptyView, supportsUltra, type View } from './contracts';

export class UltraState {
  value: View = emptyView;
  error = '';
  private listeners = new Set<() => void>();
  private stream: any;
  private abort?: AbortController;
  private generation = 0;
  private disposed = false;
  constructor(readonly remote: any, readonly sessionId: string) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.value;
  publish() { for (const fn of this.listeners) fn(); }
  accept(value: View) { if (value.revision < this.value.revision) return; this.value = value; this.error = ''; this.publish(); }
  async start() {
    const generation = ++this.generation;
    this.abort?.abort(); this.stream?.dispose();
    const abort = new AbortController(); this.abort = abort;
    try {
      const stream = this.remote.follow(this.sessionId, abort.signal); this.stream = stream;
      for await (const value of stream) {
        if (this.disposed || generation !== this.generation) break;
        this.accept(value);
      }
      if (!this.disposed && generation === this.generation && !abort.signal.aborted) throw new Error('Ultra 状态连接已断开。');
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.value = { ...this.value, available: false, enabled: false }; this.publish();
    }
  }
  reset() { if (this.disposed) return; this.value = emptyView; this.publish(); void this.start(); }
  dispose() { this.disposed = true; ++this.generation; this.abort?.abort(); this.stream?.dispose(); this.listeners.clear(); }
}

const sameSelection = (a: any, b: any) => a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;

export class UltraDirectory {
  private listeners = new Set<() => void>();
  private snapshot: any;
  private pending: any = null;
  private error: string | null = null;
  private optimistic: { selected: any; revision: number; ultra: boolean } | null = null;
  private disposers: (() => void)[];
  private disposed = false;
  readonly store = { subscribe: (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }, getSnapshot: () => this.snapshot };
  constructor(readonly base: any, readonly state: UltraState) {
    this.disposers = [base.store.subscribe(() => this.sync()), state.subscribe(() => this.sync())]; this.sync();
  }
  private sync() {
    const native = this.base.store.getSnapshot(), view = this.state.value;
    if (this.optimistic && (view.revision > this.optimistic.revision || (sameSelection(native.current, this.optimistic.selected) && view.enabled === this.optimistic.ultra))) this.optimistic = null;
    const actual = this.optimistic?.selected ?? native.current;
    const groups = native.groups.map((group: any) => ({ ...group, models: group.models.map((model: any) => view.available && supportsUltra(group, model)
      ? { ...model, reasoning: { ...model.reasoning, efforts: [...model.reasoning.efforts, { id: 'ultra', name: 'Ultra' }] } } : model) }));
    const model = groups.find((g: any) => g.id === actual?.provider)?.models.find((m: any) => m.id === actual?.model);
    const enabled = (this.optimistic?.ultra ?? view.enabled) && view.available && model?.reasoning?.efforts.some((e: any) => e.id === 'ultra') && actual?.reasoningEffort === 'max'
      && (this.optimistic || (view.route?.provider === actual.provider && view.route?.model === actual.model));
    this.snapshot = { ...native, groups, current: enabled ? { ...actual, reasoningEffort: 'ultra' } : actual,
      pending: this.pending ?? native.pending, error: this.error ?? (this.state.error || native.error) };
    for (const fn of this.listeners) fn();
  }
  async load() { await this.base.load(); return this.store.getSnapshot(); }
  async select(selection: any) {
    if (this.pending) return { ok: false, error: { message: '正在保存模式，请稍候。' } };
    const native = this.base.store.getSnapshot();
    const group = native.groups.find((g: any) => g.id === selection.provider);
    const model = group?.models.find((m: any) => m.id === selection.model);
    const ultra = selection.reasoningEffort === 'ultra' && !!model && supportsUltra(group, model);
    if (!this.state.value.available) {
      if (ultra) return { ok: false, error: { message: 'Ultra 当前不可用。' } };
      return this.base.select(selection);
    }
    const actual = { ...selection, ...(ultra ? { reasoningEffort: 'max' } : {}) };
    this.pending = selection; this.error = null; this.sync();
    try {
      const result = await this.state.remote.select({ sessionId: this.state.sessionId, selection: actual, ultra });
      if (this.disposed) return result;
      if (result.ok) {
        this.optimistic = { selected: actual, revision: result.value.revision, ultra };
        this.state.accept(result.value);
      } else this.error = result.error.message;
      return result.ok ? { ok: true, value: undefined } : result;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      return { ok: false, error: { message: this.error } };
    } finally { this.pending = null; if (!this.disposed) this.sync(); }
  }
  dispose() { this.disposed = true; this.disposers.forEach(dispose => dispose()); this.listeners.clear(); }
}
