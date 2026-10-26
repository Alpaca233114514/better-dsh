// Loader row schema for `cordis.patch.yml`.
//
// Every field is volatile: the settings service projects them into the
// plugin form and re-resolves them on each read. Cache capacity is captured
// at plugin startup; the client reads its polling interval on initialization.

import z from '@deepseek-ai/schemastery'
import { REASONING_LEVEL_ORDER } from './prompt.js'

export const Config = z.object({
  cacheTtlMs: z.number().step(1).min(60000).max(86400000).default(1800000)
    .volatile()
    .description('How long a finished-turn prediction stays usable, in milliseconds.'),
  cacheMaxEntries: z.number().step(1).min(1).max(5000).default(200)
    .volatile()
    .description('How many sessions keep a cached prediction before the oldest is evicted.'),
  preferredReasoningEffort: z.union(REASONING_LEVEL_ORDER.map(level => z.const(level))).default('high')
    .volatile()
    .description('Reasoning effort asked for when the model advertises it; the nearest stronger level is used otherwise.'),
  fallbackPollMs: z.number().step(1).min(5000).max(600000).default(30000)
    .volatile()
    .description('Polling interval used only on hosts whose Client half cannot observe turn boundaries.'),
})
