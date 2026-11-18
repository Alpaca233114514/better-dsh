import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'

interface UltraService {
  providerAvailable(): boolean
  active(session: Session): boolean
  select(request: { sessionId: string; selection: { provider: string; model: string; reasoningEffort: string }; ultra: boolean }): Promise<unknown>
}

export function ultraService(ctx: Context): UltraService | undefined {
  return (ctx as unknown as { get(name: string): UltraService | undefined }).get('dshUltra')
}

export function supportsUltra(ctx: Context, provider: string, model: string, label: string, efforts: string[]) {
  return !!ultraService(ctx)?.providerAvailable() && /deepseek/i.test(`${provider} ${model} ${label}`)
    && efforts.includes('max') && !efforts.includes('ultra')
}

/** 根据 Ultra 开关为新建会话应用模型与推理强度。 Apply model and effort selection for a new session. */
export async function applySessionModelSelection(
  ctx: Context,
  sessionId: SessionId,
  selection: { provider: string; model: string; reasoningEffort?: string },
  ultraEnabled?: boolean,
) {
  if (ultraEnabled) {
    const ultra = ultraService(ctx)
    if (!ultra?.providerAvailable()) throw new Error('Ultra 插件已不可用，请重新选择推理强度。')
    await ultra.select({
      sessionId,
      selection: { provider: selection.provider, model: selection.model, reasoningEffort: 'max' },
      ultra: true,
    })
    return
  }
  await ctx.sessionController.selectModel({
    sessionId,
    provider: selection.provider,
    model: selection.model,
    ...(selection.reasoningEffort ? { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) } : {}),
  })
}
