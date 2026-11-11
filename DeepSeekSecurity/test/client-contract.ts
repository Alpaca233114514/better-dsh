import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'

declare const useSessions: UseSessions
if (false) {
  // @ts-expect-error 原生 Hook 必须传 selector。 Native hooks require a selector.
  useSessions()
  useSessions(state => state.ids)
}
