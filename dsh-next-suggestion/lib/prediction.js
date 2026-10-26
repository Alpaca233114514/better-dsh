// The prediction pipeline: turn detection, route resolution, model call,
// output filtering, and caching.

import { createHash } from 'node:crypto'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  PREDICTION_TEMPERATURE,
  SYSTEM_PROMPT,
  contextOf,
  lastMeaningfulMessage,
  messageText,
  preferredEffortOf,
  sanitize,
  usablePrediction,
} from './prompt.js'

export const MAX_TOKENS = 2048
export const TIMEOUT_MS = 45000
export const EMPTY_TTL_MS = 120000

function hashOf(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function resolveRoute(ctx, session) {
  const config = session.requestHeader()?.config
  if (config?.provider && config?.model) return { provider: config.provider, model: config.model }
  return ctx.get('agentDefaultModel')?.currentSelection()
}

function completedTurn(session) {
  const events = session.snapshotEvents()
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event.type === 'turn/start' || (event.type === 'user/message' && event.data.source.kind === 'user')) return undefined
    if (event.type === 'turn/end') return event.data.reason.kind === 'completed' ? event.seq : undefined
  }
  return undefined
}

export function createPredictor({ ctx, debug, cache, readConfig }) {
  const pending = new WeakMap()

  async function predict(session, force = false) {
    const turn = completedTurn(session)
    if (turn === undefined) return ''
    const messages = session.deriveMessages()
    const last = lastMeaningfulMessage(messages)
    if (!last || last.role !== 'assistant' || last.content.some(block => block.type === 'tool-call')) return ''
    const assistantText = messageText(last).trim()
    if (!assistantText) return ''

    const transcript = contextOf(messages)
    const route = resolveRoute(ctx, session)
    const llm = ctx.get('llm')
    if (!transcript || !route || !llm) return ''
    const config = readConfig()
    const key = hashOf(JSON.stringify([turn, transcript, route.provider, route.model, config.preferredReasoningEffort]))
    const cached = cache.get(session.id, key)
    if (!force && cached !== undefined) return cached
    const current = pending.get(session)
    if (current?.key === key) return current.promise
    const promise = generate(session, turn, key, transcript, assistantText, route, llm, config)
    pending.set(session, { key, promise })
    try {
      return await promise
    } finally {
      if (pending.get(session)?.promise === promise) pending.delete(session)
    }
  }

  async function generate(session, turn, key, transcript, assistantText, route, llm, config) {
    const info = await llm.resolveModelInfo(route.provider, route.model)
    const effort = preferredEffortOf(info?.reasoning?.efforts, config.preferredReasoningEffort)
    // A fresh timeout budget per attempt: a 400 retry must not inherit the
    // time the first attempt already burned.
    const optionsFor = () => ({
      provider: route.provider,
      model: route.model,
      system: SYSTEM_PROMPT,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
      messages: [createUserMessage({
        content: [{
          type: 'text',
          text: [
            "Conversation (oldest first). 'User:' lines were written by the user, 'Assistant:' lines by the agent.",
            '',
            transcript,
          ].join('\n'),
        }],
        source: { kind: 'plugin:dsh-next-suggestion' },
      })],
      maxTokens: MAX_TOKENS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const run = async extra => {
      const assembler = new BlockAssembler()
      for await (const chunk of llm.stream({ ...optionsFor(), ...extra })) assembler.push(chunk)
      if (assembler.finish.kind === 'error' || assembler.finish.kind === 'aborted') {
        throw Object.assign(new Error(assembler.finish.failure.message), assembler.finish.failure)
      }
      return assembler
    }

    let assembler
    try {
      assembler = await run({ temperature: PREDICTION_TEMPERATURE })
    } catch (error) {
      if (error.status !== 400 || !/temperature/i.test(error.message)) throw error
      assembler = await run({})
    }

    const blocks = assembler.blocks()
    const raw = blocks
      .filter(block => block?.type === 'text')
      .map(block => block.text)
      .join('')
    const text = assembler.finish.kind === 'stop' ? usablePrediction(sanitize(raw), assistantText) : ''
    debug('model-finished', {
      sessionId: session.id,
      key,
      effort,
      finish: assembler.finish,
      blocks,
      transcriptChars: transcript.length,
      raw,
      text,
    })

    if (completedTurn(session) !== turn) return ''
    cache.set(session.id, key, text, Date.now(), text ? config.cacheTtlMs : EMPTY_TTL_MS)
    return text
  }

  return { predict }
}
