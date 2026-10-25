/** Qwen host integration. Protocol conversion and replay belong to DSH. */
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { LlmError, resolveImageAttachmentAccess, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { stream, streamSimple } from '@earendil-works/pi-ai/api/openai-completions'
import { DEFAULT_THINKING_BUDGETS, resolveModels } from './catalog.js'
import type { QwenConfig } from './config.js'

export { Config } from './config.js'
export type { QwenConfig } from './config.js'
export { DEFAULT_THINKING_BUDGETS, resolveModels } from './catalog.js'
export type { Modality, ModelConfig, ThinkingBudgets, ThinkingMode } from './catalog.js'
export const name = 'dsh-qwen'

interface Host {
  inject(services: string[], callback: (child: Host) => void): void
  get(service: string): any
  effect(callback: () => unknown): unknown
  llm: { registerAdapter(routes: string[], adapter: PiAiAdapter): unknown }
}

/** Build an immutable route before registering anything with the host. */
export function apply(ctx: Host, config: QwenConfig): void {
  if (!config.enabled) return
  const route = config.route.trim()
  const keyRef = config.apiKeyEnv.trim()
  if (!route || !keyRef) throw new Error('dsh-qwen: route and apiKeyEnv must not be empty')
  const endpoint = new URL(config.baseURL.trim())
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('dsh-qwen: baseURL must be HTTP(S), without credentials, query or fragment')
  }
  const baseUrl = endpoint.href.replace(/\/+$/, '')
  const displayName = config.displayName.trim() || 'Qwen'
  const thinkingBudgets = { ...DEFAULT_THINKING_BUDGETS, ...config.thinkingBudgets }
  const entries = config.models?.length ? config.models : [{ id: 'qwen3.8-flash' }]
  const models = resolveModels({ route, baseURL: baseUrl, models: entries, thinkingBudgets, thinkingMode: config.thinkingMode })

  ctx.inject(['llm'], child => {
    const resolveKey = async (): Promise<string> => {
      const credentials = child.get('credentials')
      const value = credentials
        ? (await credentials.resolve(keyRef))?.value
        : launchEnvironmentOf(child).get(keyRef)?.value
      if (typeof value === 'string' && value.trim()) return value
      throw new LlmError(`dsh-qwen: configure credential reference ${keyRef} for route ${route}`, 'MISSING_CREDENTIAL')
    }
    const provider = {
      id: route, name: displayName, baseUrl,
      auth: { apiKey: { name: 'Qwen API key', resolve: async () => ({ auth: { apiKey: await resolveKey() }, source: keyRef }) } },
      getModels: () => models,
      stream, streamSimple,
    }
    const profile = {
      provider: route, displayName, piProvider: provider,
      streamIdleTimeoutMs: 300_000,
      maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 2048 * 2048,
      requestImageMaxBytes: 1024 * 1024,
      retryPolicy: resolveRetryPolicy(undefined, `dsh-qwen: ${route}`),
      reasoning: config.defaultReasoningEffort,
      thinkingBudgets,
      headers: { ...config.headers },
      configuredMaxTokens: new Map(entries.filter(entry => entry.maxTokens !== undefined).map(entry => [entry.id.trim(), entry.maxTokens!])),
      modelErrors: new Map<string, string>(),
    }
    // Stable identity lets DSH reuse its immutable provider snapshot.
    const profiles = new Map([[route, profile]])
    const adapter = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: resolveKey,
      auth: {
        credentials: {
          read: async () => undefined, list: async () => [],
          write: async () => { throw new Error('dsh-qwen: use the DSH credential store') },
          delete: async () => undefined,
        },
        authContext: {
          env: async (key: string) => launchEnvironmentOf(child).get(key)?.value,
          fileExists: async () => false,
        },
      },
      resolveAttachments: () => child.get('attachments'),
      resolveImageAccess: (attachments: unknown, ref: unknown) => resolveImageAttachmentAccess(
        attachments, (hostPath: string) => child.get('fs')?.processPathFromHostPath(hostPath), ref,
      ),
    })
    // Non-thinking models must not inherit the route's high default. Explicit
    // unsupported effort still fails through the official adapter.
    const defaults = (options: Record<string, unknown>) => ({
      ...options,
      ...(models.find(model => model.id === options.model)?.reasoning === false && options.reasoningEffort === undefined
        ? { reasoningEffort: 'off' } : {}),
    })
    const originalStream = adapter.stream.bind(adapter)
    adapter.stream = options => originalStream(defaults(options))
    const originalPrepare = adapter.prepareCall.bind(adapter)
    adapter.prepareCall = async (...args) => {
      const prepared = await originalPrepare(...args)
      return { ...prepared, stream: options => prepared.stream(defaults(options)) }
    }
    child.effect(() => child.llm.registerAdapter([route], adapter))
  })
}
