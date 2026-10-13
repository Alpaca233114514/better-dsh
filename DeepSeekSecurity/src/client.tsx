import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { contribution } from './remote.ts'
import { source } from './mention.ts'
import { SecurityProgress } from './progress-panel.tsx'
import styles from './panel.css'
export { SecurityProgress } from './progress-panel.tsx'

export const inject = ['inputTriggers', 'slots', 'remote']
export async function apply(ctx: Context) {
  ctx.effect(() => ctx.inputTriggers.registerSource(source))
  await ctx.remote.$mount(contribution)
  ctx.effect(() => {
    const element = document.createElement('style')
    element.textContent = styles
    document.head.append(element)
    return () => element.remove()
  })
  ctx.inject(['slots', 'remote.deepseekSecurity'], scope => {
    function Dock({ sessionId }: PropsRuntime<'conversation.input.dock'>) {
      return <SecurityProgress key={sessionId} sessionId={sessionId} remote={scope.remote.deepseekSecurity} />
    }
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: 'deepseek-security', order: 20,
    }, Dock))
  })
}
