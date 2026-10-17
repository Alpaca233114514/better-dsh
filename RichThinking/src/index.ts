import z from '@deepseek-ai/schemastery'
import type { HostContext } from './contracts.ts'

/** DSH's native Config schema supplies the Plugins settings form and persistence. */
export const Config = z.object({
  enabled: z.boolean().default(true).description('Enable Rich Thinking / 启用丰富思考').volatile(),
  language: z.union(['zh', 'en']).default('zh').description('状态词语言 / Status language').volatile(),
  vocabularyMode: z.union(['append', 'replace']).default('append').description('Custom vocabulary mode / 自定义词库模式').volatile(),
  englishVerbs: z.array(z.string()).default([]).description('Custom English phrases / 自定义英文词库').volatile(),
  chineseVerbs: z.array(z.string()).default([]).description('Custom Chinese phrases / 自定义中文词库').volatile(),
  intervalMs: z.number().min(2000).max(60000).step(1).default(5000).description('Switch interval in ms / 切换间隔（毫秒）').volatile(),
  animation: z.boolean().default(true).description('Left-to-right character replacement / 从左到右逐字替换').volatile(),
})

export function apply(ctx: HostContext): void {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: true }, ctx.fiber))
  })
}
