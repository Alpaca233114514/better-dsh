import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useMemo, useState } from 'react'
import type { SecurityRemote } from './contracts.ts'
import { CyberPanel, type RepositoryChoice } from './cyber-panel.tsx'
import { CyberIcon } from './cyber-icons.tsx'
import { CyberBoundary, CyberLoading } from './cyber-feedback.tsx'
import { contribution } from './remote.ts'
import { source } from './mention.ts'
import { SecurityProgress } from './progress-panel.tsx'
import styles from './panel.css'
import cyberStyles from './cyber.css'
export { SecurityProgress } from './progress-panel.tsx'

type ConversationNavigation = { openSession: (id: string) => void }
type SessionCatalog = { refresh: () => Promise<void>; list: { getSnapshot: () => { byId: Record<string, unknown> } } }

export const inject = ['inputTriggers', 'slots', 'remote', 'layout']
export async function apply(ctx: Context) {
  ctx.effect(() => ctx.inputTriggers.registerSource(source))
  await ctx.remote.$mount(contribution)
  ctx.effect(() => {
    const element = document.createElement('style')
    element.textContent = styles + '\n' + cyberStyles
    document.head.append(element)
    return () => element.remove()
  })
  ctx.inject(['slots', 'remote.deepseekSecurity'], scope => {
    const openConversation = async (id: string) => {
      const services = ctx as unknown as { get(name: string): unknown }
      const navigation = services.get('uiWorkspace') as ConversationNavigation | undefined
      const catalog = services.get('sessions') as SessionCatalog | undefined
      if (!navigation?.openSession || !catalog?.refresh) throw new Error('DSH 会话导航不可用，请检查工作区插件。')
      await catalog.refresh()
      if (!catalog.list.getSnapshot().byId[id]) await catalog.refresh()
      if (!catalog.list.getSnapshot().byId[id]) throw new Error('会话尚未出现在 DSH 会话列表中，请重试。')
      navigation.openSession(id)
    }
    const remote: SecurityRemote = {
      state: request => scope.remote.deepseekSecurity.state(request),
      start: request => scope.remote.deepseekSecurity.start(request),
      cancel: request => scope.remote.deepseekSecurity.cancel(request),
      details: request => scope.remote.deepseekSecurity.details(request),
      dashboard: request => scope.remote.deepseekSecurity.dashboard(request),
      models: request => scope.remote.deepseekSecurity.models(request),
      setFindingStatus: request => scope.remote.deepseekSecurity.setFindingStatus(request),
      repairFinding: request => scope.remote.deepseekSecurity.repairFinding(request),
    }
    function Dock({ sessionId }: PropsRuntime<'conversation.input.dock'>) {
      return <SecurityProgress key={sessionId} sessionId={sessionId} remote={remote} />
    }
    function Main({ useSessions }: PropsRuntime<'main'>) {
      const sessions = useSessions(state => state)
      const [selected, setSelected] = useState<string | null>(null)
      const [openScan, setOpenScan] = useState(false)
      const repositories = useMemo(() => {
        const roots = new Map<string, RepositoryChoice>()
        for (const id of sessions.ids) {
          const session = sessions.byId[id]
          if (!session?.cwd || session.origin === 'subagent' || roots.has(session.cwd)) continue
          roots.set(session.cwd, { sessionId: id, path: session.cwd, name: session.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? session.cwd })
        }
        return [...roots.values()]
      }, [sessions])
      const current = repositories.find(repository => repository.sessionId === selected) ?? repositories[0]
      if (!current) return <div className="cy-app cy-welcome"><CyberIcon size={40} /><h1>{sessions.phase === 'ready' ? '请先打开工作区' : 'Cyber'}</h1>{sessions.phase !== 'ready' && <CyberLoading label="正在读取 DSH 工作区…" />}</div>
      return <CyberPanel key={current.sessionId} repositories={repositories} remote={remote} sessionId={current.sessionId} initialScanOpen={openScan} onOpenConversation={openConversation} onRepository={(id, newScan = false) => { setSelected(id); setOpenScan(newScan) }} />
    }
    function Entry(props: PropsRuntime<'main'>) {
      return <CyberBoundary onBack={() => ctx.layout.selectPanel(null)}><Main {...props} /></CyberBoundary>
    }
    scope.slots.inject('main', () => scope.slots.register({ name: 'main', key: 'deepseek-security-cyber' }, Entry))
    scope.slots.inject('sidebar.panellist', () => scope.slots.register({
      name: 'sidebar.panellist', id: 'deepseek-security-cyber', order: 45, label: 'Cyber',
    }, ({ size }: PropsRuntime<'sidebar.panellist'>) => <CyberIcon size={size} />))
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: 'deepseek-security', order: 20,
    }, Dock))
    scope.effect(() => () => {
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === 'deepseek-security-cyber') ctx.layout.selectPanel(null)
    })
  })
}
