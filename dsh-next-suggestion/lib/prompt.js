// Pure prediction prompt and filtering helpers.
//
// This module must stay free of any DSH service imports: the host harness
// runs against these functions without @deepseek-ai/dsh-llm installed.

export const MAX_MESSAGES = 40
export const MAX_TRANSCRIPT_CHARS = 24000
export const MAX_MESSAGE_CHARS = 4000
export const MAX_PREDICTION_CHARS = 240
export const PREDICTION_TEMPERATURE = 0.4
export const ECHO_MIN_CHARS = 8
export const ECHO_MAX_SIMILARITY = 0.9
export const REASONING_LEVEL_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export const SYSTEM_PROMPT = [
  'This request comes from the app, not from the user: treat it as a suggestion task, not as something the user typed.',
  '',
  'The suggestion will appear in the user\'s empty message composer. They may accept it, edit it, or ignore it, and it is never sent automatically.',
  '',
  'Predict the single message this user is most likely to type next, given the visible conversation. Continue the intent of the latest exchange: name the concrete action and the concrete thing it acts on, instead of a generic follow-up that would fit any conversation.',
  '',
  'Write it the way this user writes: reuse their language, terminology, tone and level of brevity, and keep only the requirements needed to preserve the meaning.',
  '',
  'Prefer the most grounded next move, even when several continuations are plausible. Answer with no suggestion only when the conversation contains nothing the user could reasonably build on.',
  '',
  'Output exactly one line of at most 240 characters, or the single word null when there is no grounded next move. No alternatives, no explanation, no quotes, no markdown.',
  '',
  'The conversation is in the next message: lines starting with "User:" were written by the user, lines starting with "Assistant:" by the agent. Output only the message text.',
].join('\n')

export function messageText(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content
    .filter(block => block?.type === 'text')
    .map(block => block.text)
    .join(' ')
}

export function contextOf(messages) {
  if (!Array.isArray(messages)) return ''
  const lines = []
  let used = 0
  for (let index = messages.length - 1; index >= 0 && lines.length < MAX_MESSAGES; index -= 1) {
    const message = messages[index]
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue
    if (message.role === 'user' && message.source && message.source.kind !== 'user') continue
    const text = messageText(message).trim()
    if (!text) continue
    const speaker = message.role === 'user' ? 'User' : 'Assistant'
    const line = `${speaker}: ${text.slice(0, MAX_MESSAGE_CHARS)}`
    const cost = line.length + (lines.length ? 1 : 0)
    if (used + cost > MAX_TRANSCRIPT_CHARS) break
    lines.unshift(line)
    used += cost
  }
  return lines.join('\n')
}

export function lastMeaningfulMessage(messages) {
  if (!Array.isArray(messages)) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue
    if (message.role === 'user' && message.source && message.source.kind !== 'user') continue
    return message
  }
  return undefined
}

export function preferredEffortOf(efforts, preferred = 'high') {
  if (!Array.isArray(efforts)) return undefined
  const ids = efforts
    .map(effort => (typeof effort?.id === 'string' && effort.id ? effort.id : null))
    .filter(Boolean)
  if (ids.length === 0) return undefined
  if (ids.includes(preferred)) return preferred
  const target = REASONING_LEVEL_ORDER.indexOf(preferred)
  const ranked = ids
    .map(id => ({ id, rank: REASONING_LEVEL_ORDER.indexOf(id) }))
    .filter(entry => entry.rank !== -1)
  if (ranked.length === 0) return ids[0]
  const distance = entry => (entry.rank >= target ? entry.rank - target : (target - entry.rank) * 1.5)
  return ranked.reduce((best, entry) => (distance(entry) < distance(best) ? entry : best)).id
}

export function sanitize(raw) {
  let text = String(raw ?? '').trim()
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text)
      const value = parsed?.suggestion ?? parsed?.text ?? parsed?.message ?? parsed?.next_message
      text = value == null ? '' : String(value)
    } catch {
      // keep the original text
    }
  }
  text = text
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/```/g, '')
  text = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line) ?? ''
  const stripped = text
    .replace(/^(assistant|user|suggestion|next message)\s*[:：]\s*/i, '')
    .replace(/^["'“”‘’「」`]+|["'“”‘’「」`]+$/g, '')
    .replace(/^(好的|当然|没问题)[，,]?\s*/, '')
    .replace(/[。．.]+$/, '')
    .trim()
  if (/^(null|nil|none|undefined|n\/a)$/i.test(stripped)) return ''
  return stripped
}

function bigramsOf(text) {
  const compact = String(text ?? '').replace(/\s+/g, '')
  const grams = new Set()
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.add(compact.slice(index, index + 2))
  }
  return grams
}

export function similarity(a, b) {
  const left = bigramsOf(a)
  const right = bigramsOf(b)
  if (left.size === 0 || right.size === 0) return 0
  let overlap = 0
  for (const gram of left) {
    if (right.has(gram)) overlap += 1
  }
  return overlap / Math.min(left.size, right.size)
}

export function echoesReply(text, lastAssistantText) {
  const prediction = String(text ?? '').replace(/\s+/g, '')
  if (prediction.length < ECHO_MIN_CHARS) return false
  if (String(lastAssistantText ?? '').replace(/\s+/g, '').includes(prediction)) return true
  return similarity(prediction, lastAssistantText) > ECHO_MAX_SIMILARITY
}

export function usablePrediction(text, lastAssistantText) {
  const candidate = String(text ?? '').trim()
  if (!candidate) return ''
  if (candidate.length > MAX_PREDICTION_CHARS) return ''
  if (/^\s*(以下是|这里是|我来|我会|作为)/.test(candidate)) return ''
  if (/^\s*(Sure\b|Here(?: is| are|'s)\b|Of course\b|Certainly\b|I (?:will|can|have)\b|I'll\b)/i.test(candidate)) return ''
  if (echoesReply(candidate, lastAssistantText)) return ''
  return candidate
}
