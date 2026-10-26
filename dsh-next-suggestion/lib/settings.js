// Runtime settings resolution shared by the Host half.
//
// The Loader schema is the single source of truth: this module only unwraps
// volatile references, applies defaults, and validates plugin-page edits
// before they are written back through the settings service.

import { REASONING_LEVEL_ORDER } from './prompt.js'

export const DEFAULT_CACHE_TTL_MS = 1800000
export const DEFAULT_CACHE_MAX_ENTRIES = 200
export const DEFAULT_FALLBACK_POLL_MS = 30000
export const DEFAULT_EFFORT = 'high'

export const CACHE_TTL_MIN_MS = 60000
export const CACHE_TTL_MAX_MS = 86400000
export const CACHE_MAX_ENTRIES_MAX = 5000
export const FALLBACK_POLL_MIN_MS = 5000
export const FALLBACK_POLL_MAX_MS = 600000

export const EDITABLE_FIELDS = {
  cacheTtlMs: { kind: 'number', min: CACHE_TTL_MIN_MS, max: CACHE_TTL_MAX_MS },
  cacheMaxEntries: { kind: 'number', min: 1, max: CACHE_MAX_ENTRIES_MAX },
  preferredReasoningEffort: { kind: 'choice', options: REASONING_LEVEL_ORDER },
  fallbackPollMs: { kind: 'number', min: FALLBACK_POLL_MIN_MS, max: FALLBACK_POLL_MAX_MS },
}

export function unwrapRef(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function') return value.get()
  return value
}

export function resolveConfig(config) {
  const source = config ?? {}
  const cacheTtlMs = unwrapRef(source.cacheTtlMs)
  const cacheMaxEntries = unwrapRef(source.cacheMaxEntries)
  const preferredReasoningEffort = unwrapRef(source.preferredReasoningEffort)
  const fallbackPollMs = unwrapRef(source.fallbackPollMs)
  return {
    cacheTtlMs: typeof cacheTtlMs === 'number' ? cacheTtlMs : DEFAULT_CACHE_TTL_MS,
    cacheMaxEntries: typeof cacheMaxEntries === 'number' ? cacheMaxEntries : DEFAULT_CACHE_MAX_ENTRIES,
    preferredReasoningEffort:
      typeof preferredReasoningEffort === 'string' && REASONING_LEVEL_ORDER.includes(preferredReasoningEffort)
        ? preferredReasoningEffort
        : DEFAULT_EFFORT,
    fallbackPollMs: typeof fallbackPollMs === 'number' ? fallbackPollMs : DEFAULT_FALLBACK_POLL_MS,
  }
}

export function normalizeEdit(field, raw) {
  const spec = Object.hasOwn(EDITABLE_FIELDS, field) ? EDITABLE_FIELDS[field] : undefined
  if (!spec) return { ok: false, reason: 'unknown-field' }
  if (spec.kind === 'choice') {
    return spec.options.includes(raw) ? { ok: true, value: raw } : { ok: false, reason: 'invalid-value' }
  }
  let value = raw
  if (typeof value === 'string' && value.trim() !== '') value = Number(value)
  if (typeof value !== 'number' || !Number.isInteger(value)) return { ok: false, reason: 'invalid-value' }
  if (value < spec.min || value > spec.max) return { ok: false, reason: 'out-of-range' }
  return { ok: true, value }
}

export function findSettingsDescriptor(descriptors, rowId) {
  if (!Array.isArray(descriptors)) return undefined
  return descriptors.find(row => row?.ns === rowId || (typeof row?.ns === 'string' && row.ns.endsWith(':' + rowId)))
}
