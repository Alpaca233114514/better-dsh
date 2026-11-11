import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'

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
