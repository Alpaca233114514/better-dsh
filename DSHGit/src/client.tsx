import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { createRoot } from 'react-dom/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitRemote } from './contracts.ts'
import { contribution } from './remote.ts'
import { GitLauncher } from './launcher.tsx'
import { GitPanel, Icon } from './panel.tsx'
import { GitNotifications } from './notifications.tsx'
import styles from './panel.css'

export const inject = ['slots', 'remote', 'sidebarRight', 'sidebarRightTabs']
export async function apply(ctx: Context) {
  await ctx.remote.$mount(contribution)
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style); return () => style.remove() })
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
    function Tab({ sessionId, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
      const { tab } = useTabInfo()
      return <div className="dg-docked"><GitPanel key={sessionId} sessionId={sessionId} remote={remote} active={tab.visible} onClose={() => tab.actions.close()}/></div>
    }
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: 'dshgit',
    }, Tab))
    scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({
      name: 'sidebar.right.pane.tab.title', key: 'dshgit',
    }, () => <>变更</>))
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities', id: 'dshgit', order: 10,
    }, Entry))
  })
}
