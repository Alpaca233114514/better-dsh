import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { contribution } from './remote.ts'
import { GitLauncher } from './launcher.tsx'
import styles from './panel.css'

export const inject = ['slots', 'remote']
export async function apply(ctx: Context) {
  await ctx.remote.$mount(contribution)
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style); return () => style.remove() })
  ctx.inject(['remote.dshgit'], scope => {
    function Entry({ sessionId }: PropsRuntime<'conversation.session.header.utilities'>) {
      return <GitLauncher key={sessionId} sessionId={sessionId} remote={scope.remote.dshgit}/>
    }
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities', id: 'dshgit', order: 10,
    }, Entry))
  })
}
