// Per-session prediction cache.
//
// Each session keeps exactly one prediction (a fresh result overwrites the
// previous one). Empty strings are valid hits: a filtered-out prediction
// must not be re-requested on every focus until its short TTL expires.

export function createPredictionCache({ ttlMs = 1800000, maxEntries = 200 } = {}) {
  const entries = new Map()
  const defaultTtlMs = ttlMs

  function prune() {
    if (entries.size <= maxEntries) return
    const ordered = [...entries.entries()].sort((a, b) => a[1].at - b[1].at)
    const excess = entries.size - maxEntries
    for (let index = 0; index < excess; index += 1) entries.delete(ordered[index][0])
  }

  return {
    get(sessionId, key, now = Date.now()) {
      const entry = entries.get(sessionId)
      if (!entry) return undefined
      if (entry.key !== key) return undefined
      if (now - entry.at >= entry.ttlMs) return undefined
      return entry.text
    },
    set(sessionId, key, text, now = Date.now(), ttlMs = defaultTtlMs) {
      entries.set(sessionId, { key, text, at: now, ttlMs })
      prune()
    },
    prune,
    get size() {
      return entries.size
    },
  }
}
