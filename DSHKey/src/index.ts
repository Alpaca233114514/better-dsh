import z from '@deepseek-ai/schemastery'
import type { HostContext } from './contracts.ts'

// Validated and persisted by DSH's Host settings service, including revision checks.
export const Config = z.object({
  enabled: z.boolean().default(true).description('启用 DSHKey 扩展快捷键').volatile(),
  sameWorkspace: z.boolean().default(true).description('仅切换同一工作区的会话').volatile(),
  wrapSessions: z.boolean().default(true).description('会话切换到末尾后循环').volatile(),
})

export function apply(ctx: HostContext): void {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: true }, ctx.fiber))
  })
}
