import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import { contribution, selectSchema, sessionSchema, supportsUltra, type SelectRequest, type Stored, type View } from './contracts';
import { projection } from './projection';
import policy from './policy.cjs';

export const inject = ['agents', 'sessions', 'sessionQuery', 'sessionProjections', 'sessionController', 'subagents', 'systemPrompt', 'typert'];

export class UltraService extends TypertRemoteService {
  private watchers = new Map<string, Set<() => void>>();
  private selecting = new Set<string>();
  private shutdown = new AbortController();
  private captured = new WeakMap<object, { effort: string; enabled: boolean }>();

  constructor(ctx: any) {
    super(ctx, 'dshUltra');
    ctx.sessionProjections.register(projection);
    ctx.sessionProjections.onChanged((session: any, key: string) => { if (key === 'dshUltra' || key === 'modelSelection') this.notify(session.id); });
    ctx.on('agent/status', ({ agent }: any) => { this.notify(agent.id); if (agent.session.header.parentSession) this.notify(agent.session.header.parentSession); });
    ctx.on('session/disposed', (session: any) => this.notify(session.id));
    ctx.on('subagent/provider-added', () => this.notifyAll());
    ctx.on('subagent/provider-removed', () => this.notifyAll());
    ctx.on('agent/created', ({ agent }: any) => this.notify(agent.id));
    ctx.systemPrompt.section({ name: 'dsh-ultra', order: 8450, interpolate: false, text: ({ agent }: any) => {
      if (!agent) return '';
      const enabled = this.active(agent.session);
      const effort = 'max';
      this.captured.set(agent, { enabled, effort });
      return enabled ? `${policy.delegationInstructions('ultra')}\nUse the existing native subagent tools exposed in this session. Follow their schemas for delegation, effort selection, messaging and waiting; preserve the host permission and review flow.` : '';
    } });
    ctx.on('agent/request', async ({ agent }: any, next: () => Promise<any>) => {
      const resolved = await next(), captured = this.captured.get(agent);
      if (!captured?.enabled) return resolved;
      return { ...resolved, reasoningEffort: captured.effort };
    }, { prepend: true });
    ctx.effect(() => () => { this.shutdown.abort(); this.notifyAll(); this.watchers.clear(); });
  }

  state(session: any): Stored { return this.ctx.sessionProjections.stateOf(session, 'dshUltra'); }
  record(session: any, type: string, value: unknown) { appendPluginRecord(session, `plugin:ultra/${type}` as never, value as never); }
  active(session: any) { const state = this.state(session); return state.enabled && this.providerAvailable(); }
  providerAvailable() { const provider = this.ctx.subagents.getProvider('spawn'); return !!provider?.prepareContinuable && !!provider.capabilities.agentOptions && !!provider.capabilities.depthLimit; }
  notify(id: string) { for (const listener of this.watchers.get(id) ?? []) listener(); }
  notifyAll() { for (const id of this.watchers.keys()) this.notify(id); }
  session(id: string) { const session = this.ctx.sessions.get(id); if (!session) throw new Error('会话尚未就绪，请重新打开会话。'); return session; }
  view(id: string): View {
    return this.projectView(id, this.state(this.session(id)));
  }
  projectView(id: string, state: Stored): View {
    const available = this.providerAvailable();
    return { enabled: state.enabled && available, available, running: this.ctx.agents.get(id)?.status === 'running', route: state.route, revision: state.revision,
      children: [],
    };
  }
  async readView(id: string, signal: AbortSignal): Promise<View> {
    if (this.ctx.sessions.get(id)) return this.view(id);
    const observation = await this.ctx.sessionQuery.observeSession(id, { signal });
    try {
      if (this.ctx.sessions.get(id)) return this.view(id);
      return this.projectView(id, observation.projections.values.dshUltra);
    } finally { observation[Symbol.dispose](); }
  }
  async writableSession(id: string) {
    const resolved = await this.ctx.sessionController.resolveAgent(id);
    if ('error' in resolved) throw resolved.error;
    return resolved.agent;
  }

  @Remote({ resources: { session: (request: SelectRequest) => request.sessionId } })
  async select(request: SelectRequest): Promise<View> {
    selectSchema.parse(request);
    if (this.selecting.has(request.sessionId)) throw new Error('正在保存模式，请稍候。');
    this.selecting.add(request.sessionId);
    try {
      const before = await this.writableSession(request.sessionId);
      if (before?.status === 'running') throw new Error('请在当前运行结束后切换模式。');
      if (before?.session.header.origin === 'subagent') throw new Error('子代理请使用独立的 effort 设置。');
      if (request.ultra && request.selection.reasoningEffort === 'ultra') throw new Error('Ultra 模式必须使用真实 Max 参数。');
      if (request.ultra) {
        if (!this.providerAvailable()) throw new Error('当前 DSH 未启用原生 spawn 子代理。');
        const catalog = await this.ctx.sessionController.modelCatalog();
        const group = catalog.groups.find((g: any) => g.id === request.selection.provider);
        const model = group?.models.find((m: any) => m.id === request.selection.model);
        if (!model || !supportsUltra(group, model)) throw new Error('当前 DeepSeek 模型不支持 Max。');
      }
      // 先由宿主接受真实模型选择，再提交独立模式。 Commit mode only after native selection succeeds.
      if (this.ctx.agents.get(request.sessionId)?.status === 'running') throw new Error('当前会话已开始运行，请稍后切换。');
      await this.ctx.sessionController.selectModel({ sessionId: request.sessionId, ...request.selection, ...(request.ultra ? { reasoningEffort: 'max' } : {}) });
      const session = this.session(request.sessionId);
      if (session.header.origin === 'subagent') throw new Error('Ultra 模式仅用于主会话。');
      this.record(session, 'mode', { enabled: request.ultra, route: request.ultra ? { ...request.selection, reasoningEffort: 'max' } : null });
      return this.view(request.sessionId);
    } finally { this.selecting.delete(request.sessionId); }
  }

  @Remote({ mode: 'stream', resources: { session: (sessionId: string) => sessionId } })
  async *follow(sessionId: string, signal: AbortSignal): AsyncIterable<View> {
    sessionSchema.parse(sessionId);
    const stopped = AbortSignal.any([signal, this.shutdown.signal]);
    let dirty = true, wake = () => {};
    const changed = () => { dirty = true; wake(); };
    const set = this.watchers.get(sessionId) ?? new Set(); set.add(changed); this.watchers.set(sessionId, set);
    stopped.addEventListener('abort', changed);
    try {
      while (!stopped.aborted) {
        if (!dirty) await new Promise<void>(resolve => { wake = resolve; if (dirty || stopped.aborted) resolve(); });
        if (stopped.aborted) break;
        dirty = false;
        yield await this.readView(sessionId, stopped);
      }
    } finally {
      set.delete(changed); if (!set.size) this.watchers.delete(sessionId);
      stopped.removeEventListener('abort', changed);
    }
  }
}

export function apply(ctx: any) {
  ctx.typert.remotes.register(contribution);
  new UltraService(ctx);
}
