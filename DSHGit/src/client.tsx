import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitRemote } from './contracts.ts'
import { contribution } from './remote.ts'
import { GitLauncher } from './launcher.tsx'
import styles from './panel.css'

export const inject = ['slots', 'remote']
export async function apply(ctx: Context) {
  await ctx.remote.$mount(contribution)
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style); return () => style.remove() })
  ctx.inject(['remote.dshgit'], scope => {
    // Every service access returns a fresh Cordis proxy. Keep one stable
    // adapter so a header re-render cannot restart the launcher's poll effect.
    const remote: GitRemote = {
      run: request => scope.remote.dshgit.run(request),
      changes: (sessionId, signal) => scope.remote.dshgit.changes!(sessionId, signal),
    }
    function Entry({ sessionId }: PropsRuntime<'conversation.session.header.utilities'>) {
      return <GitLauncher key={sessionId} sessionId={sessionId} remote={remote}/>
    }
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities', id: 'dshgit', order: 10,
    }, Entry))
  })
}
