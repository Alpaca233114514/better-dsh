import { Service } from '@deepseek-ai/cordis';
import { contribution } from './contracts';
import { UltraState, UltraDirectory } from './directory';

export const inject = ['sessions', 'modelDirectories', 'remote', 'remote.session'];
export class UltraClient extends Service {
  private entries = new Map<object, { state: UltraState; directory: UltraDirectory }>();
  constructor(ctx: any) {
    super(ctx, 'ultra');
    ctx.on('connection/reset', () => { for (const entry of this.entries.values()) entry.state.reset(); });
    ctx.effect(() => () => { for (const entry of this.entries.values()) { entry.directory.dispose(); entry.state.dispose(); } this.entries.clear(); });
  }
  entryFor(sessionId: string) {
    const binding = this.ctx.sessions.binding(sessionId);
    if (!binding) throw new Error('Ultra: session binding unavailable');
    const previous = this.entries.get(binding); if (previous) return previous;
    const state = new UltraState(this.ctx.remote.dshUltra, sessionId);
    const directory = new UltraDirectory(this.ctx.modelDirectories.directoryFor(sessionId), state);
    const entry = { state, directory }; this.entries.set(binding, entry);
    this.ctx.sessions.scope(sessionId).effect(() => () => { directory.dispose(); state.dispose(); this.entries.delete(binding); });
    void state.start();
    return entry;
  }
  directoryFor(sessionId: string) { return this.entryFor(sessionId).directory; }
}

export async function apply(ctx: any) {
  await ctx.remote.$mount(contribution);
  ctx.inject(['remote.dshUltra'], (scope: any) => { new UltraClient(scope); });
}
