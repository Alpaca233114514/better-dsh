export interface Preferences {
  enabled: boolean
  language: 'en' | 'zh'
  vocabularyMode: 'append' | 'replace'
  englishVerbs: string[]
  chineseVerbs: string[]
  intervalMs: number
  animation: boolean
  showElapsed: boolean
}

export const defaults: Preferences = {
  enabled: true, language: 'zh', vocabularyMode: 'append',
  englishVerbs: [], chineseVerbs: [], intervalMs: 5000, animation: true, showElapsed: true,
}

export function cleanWords(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((s): s is string => typeof s === 'string')
    .map(s => s.trim().replace(/(?:\.{3}|…)+$/u, '').trim()).filter(Boolean))] : []
}

export function normalize(input: Partial<Preferences> = {}): Preferences {
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    language: input.language === 'en' ? 'en' : 'zh',
    vocabularyMode: input.vocabularyMode === 'replace' ? 'replace' : 'append',
    englishVerbs: cleanWords(input.englishVerbs), chineseVerbs: cleanWords(input.chineseVerbs),
    intervalMs: typeof input.intervalMs === 'number' && Number.isFinite(input.intervalMs)
      ? Math.min(60000, Math.max(2000, Math.round(input.intervalMs))) : defaults.intervalMs,
    animation: typeof input.animation === 'boolean' ? input.animation : defaults.animation,
    showElapsed: typeof input.showElapsed === 'boolean' ? input.showElapsed : defaults.showElapsed,
  }
}

export function languageOf(config: Preferences): 'en' | 'zh' {
  return config.language
}
