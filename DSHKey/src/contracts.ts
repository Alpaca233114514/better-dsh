// Narrow public DSH 0.2.1-alpha.2 interfaces. See docs/compatibility.md.
import type { ComponentType } from 'react'
export interface Observable<T> { getSnapshot(): T; subscribe(fn: () => void): () => void }
export interface Preferences { enabled: boolean; sameWorkspace: boolean; wrapSessions: boolean }
export interface FormSnapshot { status: string; value?: Preferences; writable: boolean; revision?: number }
export interface ConfigForm extends Observable<FormSnapshot> {
  mutate(ops: { op: 'set'; path: string[]; value: unknown }[], revision?: number): Promise<boolean>
}
export type Modifier = 'primary' | 'control' | 'alt' | 'shift' | 'meta'
export interface Binding { code: string; modifiers: readonly Modifier[]; secondCode?: string }
export interface CatalogRow { id: string; label: string; keys: readonly string[]; aliases: readonly string[]; binding: Binding | null; modified: boolean; conflicts: readonly string[]; issue: string | null }
export interface FixedRow { id: string; label: string; keys: readonly string[]; group: string }
export interface ShortcutConfig { revision: string; status: 'loading' | 'ready' | 'unreadable' }
export type Edit = { type: 'set'; id: string; binding: Binding | null } | { type: 'reset'; id: string }
export type Resolution = { status: 'handled'; run(): void } | { status: 'blocked'; reason: string } | { status: 'pass' }
export interface Command {
  id: string; label(): string; aliases: readonly string[];
  defaults: Record<string, Binding>; regions: readonly string[]; modals: readonly string[];
  resolve(context: { region: string; modal: string | null }): Resolution
}
export interface Shortcuts {
  runtime: 'desktop' | 'web'; platform: 'windows' | 'macos' | 'linux';
  catalog: Observable<readonly CatalogRow[]>; fixedCatalog: Observable<readonly FixedRow[]>;
  config: Observable<ShortcutConfig>;
  register(command: Command): () => void;
  describeBinding(binding: Binding | null): { binding: Binding | null; keys: readonly string[]; issue: string | null; conflicts: readonly string[] };
  edit(edit: Edit, revision: string): Promise<{ status: string; snapshot: ShortcutConfig; conflicts?: readonly string[]; issue?: string }>;
  recording(active: boolean): Promise<void>
}
export interface SessionRow { id: string; cwd?: string; parentId?: string; origin?: string; blank: boolean; retainedBy: { mainView?: number }; running: boolean }
export interface SessionList { ids: string[]; byId: Record<string, SessionRow>; phase: string }
export interface WorkspaceList { items: readonly { sessionIds: readonly string[] }[]; archivedSessionIds: readonly string[]; phase: string }
export interface Input { focus(): void; notify(level: 'info' | 'error', text: string): void; state: Observable<{ draft: string }> }
export interface SessionBinding { sessionId: string; ctx: unknown; session: Observable<{ running: boolean; removed: boolean }> & { cancel(): Promise<{ ok: boolean; error?: { message: string } }> } }
export interface ChatNode { kind: string; visibility: string; data: unknown }
export interface ChatSnapshot { order: readonly string[]; nodes: { get(key: string): ChatNode | undefined } }
export interface ClientContext {
  effect(fn: () => () => void): unknown;
  configForms: { get<T = Preferences>(id: string): ConfigForm };
  shortcuts: Shortcuts;
  slots: { inject(name: string, fn: () => unknown): unknown; register(options: { name: string; id: string; label?: string; order?: number }, component: ComponentType): () => void };
  sessions: { list: Observable<SessionList>; binding(id: string): SessionBinding | undefined };
  workspaces: { list: Observable<WorkspaceList> };
  conversation: { input: { for(ctx: unknown): Input } };
  uiConversation: { binding(binding: SessionBinding): { target(name: 'chat'): Observable<ChatSnapshot | undefined> } };
  uiWorkspace: { openSession(id: string): void; pinSession(id: string): Promise<void>; unpinSession(id: string): Promise<void> };
  layout: { panelInfo: Observable<{ activePanelId: string | null }>; selectPanel(id: null): void }
}
export interface HostContext {
  fiber: unknown;
  inject(names: string[], callback: (ctx: { effect(fn: () => () => void): unknown; settings: { configure(options: { auto: boolean }, owner: unknown): () => void } }) => void): unknown
}
