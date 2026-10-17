import type { Binding, ChatSnapshot, ClientContext, Preferences, SessionList, SessionRow, WorkspaceList } from './contracts.ts'

export const actions = [
  { id: 'dshkey.focusInput', label: '聚焦输入框', code: 'KeyL', group: '输入与回复' },
  { id: 'dshkey.copyReply', label: '复制最近回复', code: 'KeyC', group: '输入与回复' },
  { id: 'dshkey.copyDraft', label: '复制当前草稿', code: 'KeyD', group: '输入与回复' },
  { id: 'dshkey.stop', label: '停止当前生成', code: 'KeyX', group: '输入与回复' },
  { id: 'dshkey.previous', label: '上一个会话', code: 'BracketLeft', group: '会话导航' },
  { id: 'dshkey.next', label: '下一个会话', code: 'BracketRight', group: '会话导航' },
  { id: 'dshkey.returnChat', label: '返回当前聊天', code: 'KeyJ', group: '会话导航' },
  { id: 'dshkey.pin', label: '置顶当前会话', code: 'KeyP', group: '会话导航' },
  { id: 'dshkey.unpin', label: '取消会话置顶', code: 'KeyU', group: '会话导航' },
] as const
export type ActionId = typeof actions[number]['id']
export const defaults: Preferences = { enabled: true, sameWorkspace: true, wrapSessions: true }
export const preferences = (value?: Partial<Preferences>): Preferences => ({ ...defaults, ...value })

export function currentSession(list: SessionList): SessionRow | undefined {
  return Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
}
export function adjacentSession(list: SessionList, current: SessionRow, direction: number, config: Preferences, workspaces: WorkspaceList): string | undefined {
  if (list.phase !== 'ready' || workspaces.phase !== 'ready') return
  const memberships = workspaces.items.filter(workspace => workspace.sessionIds.includes(current.id))
  const inScope = (row: SessionRow) => memberships.length ? memberships.some(workspace => workspace.sessionIds.includes(row.id))
    : !workspaces.items.some(workspace => workspace.sessionIds.includes(row.id)) && row.cwd === current.cwd
  const ids = list.ids.filter(id => {
    const row = list.byId[id]
    return row && !row.parentId && row.origin !== 'subagent' && (!row.blank || row.id === current.id)
      && !workspaces.archivedSessionIds.includes(id) && (!config.sameWorkspace || inScope(row))
  })
  const index = ids.indexOf(current.id)
  if (index < 0 || ids.length < 2) return
  const next = index + direction
  return config.wrapSessions ? ids[(next + ids.length) % ids.length] : ids[next]
}
export function latestReply(chat?: ChatSnapshot): string | undefined {
  if (!chat) return
  for (let index = chat.order.length - 1; index >= 0; index--) {
    const node = chat.nodes.get(chat.order[index]!)
    if (!node || node.kind !== 'assistant-step' || node.visibility !== 'visible') continue
    const data = node.data as { status?: string; blocks?: readonly { kind: string; text?: string }[] }
    if (data.status === 'running') continue
    const text = data.blocks?.filter(block => block.kind === 'text').map(block => block.text ?? '').join('\n\n')
    if (text?.trim()) return text
  }
}
export function defaultBindings(code: string): Record<string, Binding> {
  // Three modifiers avoid collisions with the official defaults on Windows/macOS.
  // Linux Web deliberately has no defaults: the Host only admits three reserved combinations.
  return Object.fromEntries(['desktop:windows', 'desktop:macos', 'web:windows', 'web:macos']
    .map(profile => [profile, { code, modifiers: ['primary', 'alt', 'shift'] }]))
}

export function installActions(ctx: ClientContext, readConfig: () => Preferences, clipboard: Pick<Clipboard, 'writeText'> | undefined): () => void {
  const pending = new Set<string>()
  let active = true
  const disposers: (() => void)[] = []
  try {
    for (const action of actions) disposers.push(ctx.shortcuts.register({
      id: action.id, label: () => action.label, aliases: [action.id, 'DSHKey', action.group],
      defaults: defaultBindings(action.code), regions: ['page', 'editable'], modals: [],
      resolve(context) {
        if (!active || !readConfig().enabled) return { status: 'pass' }
        if (context.modal !== null || context.region === 'terminal') return { status: 'blocked', reason: '当前焦点由其他界面使用' }
        if (action.id === 'dshkey.returnChat') return { status: 'handled', run: () => ctx.layout.selectPanel(null) }
        if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null) return { status: 'blocked', reason: '请先返回聊天' }
        const row = currentSession(ctx.sessions.list.getSnapshot())
        const binding = row && ctx.sessions.binding(row.id)
        if (!row || !binding || binding.session.getSnapshot().removed) return { status: 'blocked', reason: '没有可用的当前会话' }
        const input = ctx.conversation.input.for(binding.ctx)
        const key = `${row.id}:${action.id === 'dshkey.unpin' ? 'dshkey.pin' : action.id}`
        if (pending.has(key)) return { status: 'blocked', reason: '操作正在进行' }
        const runAsync = (work: () => Promise<unknown>, success: string) => {
          pending.add(key)
          try {
            void work().then(() => { if (active) input.notify('info', success) }, error => {
              if (active) input.notify('error', `DSHKey：${error instanceof Error ? error.message : '操作失败，请重试'}`)
            }).finally(() => pending.delete(key))
          } catch (error) { pending.delete(key); input.notify('error', `DSHKey：${String(error)}`) }
        }
        switch (action.id) {
          case 'dshkey.focusInput': return { status: 'handled', run: () => input.focus() }
          case 'dshkey.previous':
          case 'dshkey.next': {
            const target = adjacentSession(ctx.sessions.list.getSnapshot(), row, action.id === 'dshkey.next' ? 1 : -1, readConfig(), ctx.workspaces.list.getSnapshot())
            return target ? { status: 'handled', run: () => ctx.uiWorkspace.openSession(target) } : { status: 'blocked', reason: '没有相邻会话' }
          }
          case 'dshkey.copyDraft':
          case 'dshkey.copyReply': {
            const text = action.id === 'dshkey.copyDraft' ? input.state.getSnapshot().draft
              : latestReply(ctx.uiConversation.binding(binding).target('chat').getSnapshot())
            if (!text || !clipboard) return { status: 'blocked', reason: '没有可复制的文本或剪贴板不可用' }
            return { status: 'handled', run: () => runAsync(() => clipboard.writeText(text), '已复制') }
          }
          case 'dshkey.stop':
            return binding.session.getSnapshot().running ? { status: 'handled', run: () => runAsync(async () => {
              const result = await binding.session.cancel()
              if (!result.ok) throw new Error(result.error?.message ?? '停止生成失败')
            }, '已请求停止生成') } : { status: 'blocked', reason: '当前没有进行中的生成' }
          case 'dshkey.pin': return { status: 'handled', run: () => runAsync(() => ctx.uiWorkspace.pinSession(row.id), '会话已置顶') }
          case 'dshkey.unpin': return { status: 'handled', run: () => runAsync(() => ctx.uiWorkspace.unpinSession(row.id), '已取消置顶') }
        }
      },
    }))
  } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error }
  return () => { active = false; for (const dispose of disposers.reverse()) dispose() }
}
