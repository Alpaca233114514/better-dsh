/** Qwen descriptors consumed by DSH's official pi-ai adapter. */
export type Modality = 'text' | 'image'
export type ThinkingMode = 'budget' | 'effort'
export interface ThinkingBudgets { minimal: number; low: number; medium: number; high: number }
export interface ModelConfig {
  id: string
  name?: string
  preset?: string
  contextWindow?: number
  maxTokens?: number
  input?: Modality[]
  thinking?: boolean
  thinkingMode?: ThinkingMode
}
export interface CatalogInput {
  route: string
  baseURL: string
  models: readonly ModelConfig[]
  thinkingBudgets: ThinkingBudgets
  thinkingMode?: ThinkingMode
}
export interface QwenModelDescriptor {
  id: string; name: string; api: 'openai-completions'; provider: string; baseUrl: string
  input: Modality[]; contextWindow: number; maxTokens: number; reasoning: boolean
  thinkingLevelMap?: Record<string, string | null>
  compat: Record<string, unknown>
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number }
}
export const DEFAULT_THINKING_BUDGETS: Readonly<ThinkingBudgets> = Object.freeze({ minimal: 1024, low: 4096, medium: 16384, high: 32768 })
export const DEFAULT_CONTEXT_WINDOW = 262_144
export const DEFAULT_MAX_TOKENS = 32_768
const PRESETS: Readonly<Record<string, { name: string; contextWindow: number; maxTokens: number; input: Modality[] }>> = {
  'qwen3.8-flash': { name: 'Qwen3.8 Flash', contextWindow: 1_000_000, maxTokens: 131_072, input: ['text', 'image'] },
  'qwen3.8-max': { name: 'Qwen3.8 Max', contextWindow: 1_000_000, maxTokens: 131_072, input: ['text', 'image'] },
}
// Keep ordinary Chat Completions tools compatible with DashScope and Maas.
// Strict JSON-schema enforcement is not a requirement for tool execution.
const BASE_COMPAT = { supportsStore: false, supportsDeveloperRole: false, supportsStrictMode: false, maxTokensField: 'max_tokens' }
const LEVELS = { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' }
export function validateThinkingBudgets(budgets: ThinkingBudgets): void {
  let previous = 0
  for (const level of ['minimal', 'low', 'medium', 'high'] as const) {
    const value = budgets[level]
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`dsh-qwen: thinkingBudgets.${level} must be a positive integer`)
    if (value <= previous) throw new Error('dsh-qwen: thinkingBudgets must increase from minimal to high')
    previous = value
  }
}
export function resolveModels(input: CatalogInput): QwenModelDescriptor[] {
  validateThinkingBudgets(input.thinkingBudgets)
  if (!input.models.length) throw new Error('dsh-qwen: models must name at least one model')
  const seen = new Set<string>()
  return input.models.map(entry => {
    const id = entry.id.trim()
    if (!id) throw new Error('dsh-qwen: every model needs a non-empty id')
    if (seen.has(id)) throw new Error(`dsh-qwen: model "${id}" is listed twice`)
    seen.add(id)
    const preset = PRESETS[entry.preset || id.replace(/^cmaas-/, '')]
    if (entry.preset && !preset) throw new Error(`dsh-qwen: unknown preset "${entry.preset}"`)
    const contextWindow = entry.contextWindow ?? preset?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
    const maxTokens = entry.maxTokens ?? preset?.maxTokens ?? DEFAULT_MAX_TOKENS
    for (const [field, value] of Object.entries({ contextWindow, maxTokens })) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`dsh-qwen: ${id}.${field} must be a positive integer`)
    }
    const mode = entry.thinkingMode ?? input.thinkingMode ?? 'budget'
    if (!['budget', 'effort'].includes(mode)) throw new Error('dsh-qwen: unknown thinkingMode')
    const reasoning = entry.thinking ?? true
    // Schemastery parses omitted arrays as []; inherit instead of refusing boot.
    const modalities = entry.input?.length ? entry.input : preset?.input ?? ['text']
    if (modalities.some(value => value !== 'text' && value !== 'image')) throw new Error(`dsh-qwen: unsupported input modality for ${id}`)
    return {
      id, name: entry.name || preset?.name || id, api: 'openai-completions',
      provider: input.route, baseUrl: input.baseURL, input: [...modalities],
      contextWindow, maxTokens, reasoning,
      ...(reasoning ? { thinkingLevelMap: { ...LEVELS } } : {}),
      compat: {
        ...BASE_COMPAT,
        ...(reasoning ? {
          thinkingFormat: 'qwen', supportsReasoningEffort: mode === 'effort',
          ...(mode === 'budget' ? { thinkingTokenBudgetField: 'thinking_budget' } : {}),
        } : {}),
      },
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }
  })
}
