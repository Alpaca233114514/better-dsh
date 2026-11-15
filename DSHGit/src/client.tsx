import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { Workspace } from './pull-inbox.ts'
import { createRoot } from 'react-dom/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitRemote } from './contracts.ts'
import { contribution } from './remote.ts'
import { GitLauncher } from './launcher.tsx'
import { GitPanel, Icon } from './panel.tsx'
import { GitNotifications } from './notifications.tsx'
import styles from './panel.css'
import { PullPanel } from './pull-panel.tsx'
import pullStyles from './pull-panel.css'

type WorkspaceCatalog = {
  ids: readonly string[]
  byId: Record<string, { cwd?: string; origin?: string; retainedBy?: { mainView?: number } }>
  phase: string
}
export const inject = ['slots', 'remote', 'layout', 'sidebarRight', 'sidebarRightTabs']
export async function apply(ctx: Context) {
  await ctx.remote.$mount(contribution)
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles + pullStyles; document.head.append(style); return () => style.remove() })
  ctx.effect(() => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    root.render(<GitNotifications/>)
    return () => { root.unmount(); container.remove() }
  })
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: 'dshgit', kind: 'dshgit', title: () => '变更', keepMounted: true,
    guide: [{ id: 'dshgit', order: 35, title: () => 'DSHGit', description: () => '查看变更、提交与推送', icon: () => <Icon name="branch"/> }],
  }))
  ctx.inject(['remote.dshgit'], scope => {
    // Every service access returns a fresh Cordis proxy. Keep one stable
    // adapter so a header re-render cannot restart the launcher's poll effect.
    const remote: GitRemote = {
      run: request => scope.remote.dshgit.run(request),
      changes: (sessionId, signal) => scope.remote.dshgit.changes!(sessionId, signal),
    }
    function Entry({ sessionId }: PropsRuntime<'conversation.session.header.utilities'>) {
      return <GitLauncher key={sessionId} sessionId={sessionId} remote={remote} onOpen={() => ctx.sidebarRight.openTab('dshgit')}/>
    }
    function PullWorkspace({ useSessions }: PropsRuntime<'main'>) {
      const sessions: WorkspaceCatalog = useSessions((state: WorkspaceCatalog) => state)
      const workspaces = new Map<string, Workspace>()
      for (const id of sessions.ids) {
        const session = sessions.byId[id]
        if (!session?.cwd || session.origin === 'subagent') continue
        const path = /^[A-Za-z]:[\\/]/.test(session.cwd) ? session.cwd.replaceAll('\\', '/').toLowerCase() : session.cwd
        if (!workspaces.has(path) || session.retainedBy?.mainView) workspaces.set(path, { sessionId: id, path: session.cwd })
      }
      return <div className="dg-pr-page">{workspaces.size ? <div className="dg-docked"><PullPanel workspaces={[...workspaces.values()]} remote={remote}/></div>
          : <p>{sessions.phase === 'ready' ? '请先在 DSH 打开一个工作区。' : '正在读取工作区…'}</p>}</div>
    }
    function Tab({ sessionId, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
      const { tab } = useTabInfo()
      return <div className="dg-docked"><GitPanel key={sessionId} sessionId={sessionId} remote={remote} active={tab.visible} onClose={() => tab.actions.close()}/></div>
    }
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: 'dshgit',
    }, Tab))
    scope.slots.inject('main', () => scope.slots.register({ name: 'main', key: 'dshgit-pulls' }, PullWorkspace))
    scope.slots.inject('sidebar.panellist', () => scope.slots.register({
      name: 'sidebar.panellist', id: 'dshgit-pulls', order: 46, label: '拉取请求',
    }, ({ size }) => <Icon name="pr" size={size}/>))
    scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({
      name: 'sidebar.right.pane.tab.title', key: 'dshgit',
    }, () => <>变更</>))
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities', id: 'dshgit', order: 10,
    }, Entry))
  })
}
