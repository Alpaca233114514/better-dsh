import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

const number = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null
const bytes = x => x == null ? 0 : Buffer.byteLength(typeof x === 'string' ? x : JSON.stringify(x))
const ratio = (a, b) => a !== null && b > 0 ? a / b : null
const tokenFields = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'totalTokens']
export function usageMetrics(usage) {
  const out = Object.fromEntries(tokenFields.map(k => [k, number(usage?.[k])]))
  // DSH input buckets are disjoint. Missing optional cache fields mean zero only
  // when an authoritative input counter exists. Missing output stays unknown.
  out.contextTokens = out.inputTokens === null ? null : out.inputTokens + (out.cacheReadTokens ?? 0) + (out.cacheWriteTokens ?? 0)
  out.cacheHitRatio = ratio(out.cacheReadTokens, out.contextTokens)
  return out
}

export function requestMetrics(options) {
  const messages = options.messages ?? []
  const counts = { messageCount: messages.length, systemMessages: 0, userMessages: 0, assistantMessages: 0, toolMessages: 0,
    textChars: 0, imageCount: 0, fileCount: 0, historyToolCalls: 0, historyReasoningChars: 0 }
  for (const m of messages) {
    if (Object.hasOwn(counts, `${m.role}Messages`)) counts[`${m.role}Messages`]++
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type === 'text') counts.textChars += b.text?.length ?? 0
      if (b.type === 'reasoning') counts.historyReasoningChars += b.text?.length ?? 0
      if (b.type === 'image') counts.imageCount++
      if (b.type === 'file') counts.fileCount++
      if (b.type === 'tool-call') counts.historyToolCalls++
    }
  }
  return { ...counts, messageJsonBytes: bytes(messages), systemBytes: bytes(options.system), toolSchemaBytes: bytes(options.tools),
    toolCount: options.tools?.length ?? 0, reasoningEffort: options.reasoningEffort ?? null,
    temperature: number(options.temperature), maxTokens: number(options.maxTokens), stopCount: options.stop?.length ?? 0 }
}

// Fixed log2 histogram: bounded memory even for multi-hour streams.
function gaps() {
  const buckets = Array(24).fill(0)
  let count = 0, sum = 0, max = 0, over1s = 0
  return {
    add(ms) { ms = Math.max(0, ms); buckets[Math.min(23, Math.ceil(Math.log2(Math.max(1, ms))))]++; count++; sum += ms; max = Math.max(max, ms); if (ms > 1000) over1s++ },
    result() {
      const quantile = q => { let n = 0; for (let i = 0; i < buckets.length; i++) { n += buckets[i]; if (n >= Math.ceil(count * q)) return 2 ** i } return null }
      return { gapCount: count, gapMeanMs: count ? sum / count : null, gapMaxMs: count ? max : null,
        gapP50UpperMs: count ? quantile(.5) : null, gapP95UpperMs: count ? quantile(.95) : null, gapsOver1s: over1s }
    },
  }
}

export function createObserver({ emit, isLoopRequest, mono = () => performance.now(), wall = () => Date.now(),
  cpu = () => process.cpuUsage(), memory = () => process.memoryUsage().rss, elu = () => performance.eventLoopUtilization() }) {
  const steps = new Map(), contexts = new Map(), tools = new Map()
  const inflight = new Set()
  let active = 0, stopped = false
  const write = row => { if (!stopped) emit({ schemaVersion: 1, ...row }) }
  function onEvent(session, event) {
    const sid = session.id, d = event.data ?? {}, base = { sessionId: sid, seq: event.seq, time: event.time, turn: d.turn ?? null, step: d.step ?? null }
    if (event.type === 'step/start') steps.set(sid, { turn: d.turn, step: d.step, attempt: 0, retries: 0 })
    if (event.type === 'request/context') contexts.set(sid, { provider: d.provider, model: d.model, contextWindow: number(d.contextWindow) })
    if (event.type === 'llm/retry') {
      const s = steps.get(sid)
      if (s && s.turn === d.turn && s.step === d.step) s.retries++
      write({ kind: 'retry', ...base, provider: d.provider, retry: d.retry, delayMs: number(d.delayMs), failureCode: d.failure?.code ?? null })
    }
    if (event.type === 'llm/retry-started') write({ kind: 'retry-started', ...base, retry: d.retry })
    if (event.type === 'tool/call') {
      tools.set(`${sid}:${d.callId}`, { time: event.time, name: d.name })
      write({ kind: 'tool-start', ...base, callId: d.callId, toolName: d.name, argumentBytes: bytes(d.arguments) })
    }
    if (event.type === 'tool/result') {
      const id = d.message?.source?.callId, key = `${sid}:${id}`, start = tools.get(key)
      tools.delete(key)
      write({ kind: 'tool-end', ...base, callId: id ?? null, toolName: start?.name ?? null,
        callToResultMs: start ? Math.max(0, event.time - start.time) : null,
        resultBytes: bytes(d.message?.content), isError: d.message?.isError === true, failureCode: d.error?.code ?? null })
    }
    if (['step/end', 'turn/end'].includes(event.type)) {
      write({ kind: event.type, ...base })
      steps.delete(sid)
      for (const key of tools.keys()) if (key.startsWith(`${sid}:`)) tools.delete(key)
    }
    if (event.type === 'session/disposed') { steps.delete(sid); contexts.delete(sid) }
  }
  function stream(options, next) {
    return (async function* () {
      const started = mono(), startedAt = wall(), processCpu = cpu(), processElu = elu(), rssStart = memory()
      const loop = isLoopRequest(options), step = loop ? steps.get(options.sessionId) : undefined
      const meta = contexts.get(options.sessionId)
      const contextWindow = loop && meta?.provider === options.provider && meta?.model === options.model ? meta.contextWindow : null
      const identity = { callId: randomUUID(), sessionId: options.sessionId ?? null, provider: options.provider, model: options.model,
        purpose: options.purpose ?? (loop ? 'conversation' : 'unclassified'), loopRequest: loop,
        turn: step?.turn ?? null, step: step?.step ?? null, attempt: step ? ++step.attempt : null,
        retriesBefore: step?.retries ?? null, startedAt, contextWindow, ...requestMetrics(options) }
      identity.observerSetupMs = mono() - started
      active++
      const concurrency = { peak: active }, activeAtStart = active
      inflight.add(concurrency)
      for (const item of inflight) item.peak = Math.max(item.peak, active)
      write({ kind: 'call-start', ...identity, activeAtStart: active })
      let first = null, firstText = null, last = null, finishAt = null, finish = null, usage, chunkCount = 0, contentChunks = 0,
        outputTextChars = 0, outputReasoningChars = 0, outputToolArgumentChars = 0, consumerWaitMs = 0, consumerWaitMaxMs = 0
      const gap = gaps(), toolIndexes = new Set()
      let threw = false, exhausted = false
      try {
        for await (const chunk of next()) {
          const at = mono()
          chunkCount++
          const text = (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && chunk.text !== ''
          const tool = chunk.type === 'tool-call-delta' && (chunk.argumentsDelta !== '' || chunk.name !== undefined)
          if (text || tool) {
            first ??= at
            if (last !== null) gap.add(at - last)
            last = at; contentChunks++
          }
          if (chunk.type === 'text-delta') { if (chunk.text !== '') firstText ??= at; outputTextChars += chunk.text.length }
          if (chunk.type === 'reasoning-delta') outputReasoningChars += chunk.text.length
          if (chunk.type === 'tool-call-delta') { outputToolArgumentChars += chunk.argumentsDelta.length; toolIndexes.add(chunk.index) }
          if (chunk.type === 'usage') usage = chunk.usage
          if (chunk.type === 'finish') { finish = chunk.reason; finishAt = at }
          const beforeYield = mono()
          try { yield chunk } finally {
            const wait = mono() - beforeYield
            consumerWaitMs += wait; consumerWaitMaxMs = Math.max(consumerWaitMaxMs, wait)
          }
        }
        exhausted = true
      } catch (error) { threw = true; throw error }
      finally {
        const end = mono(), c = cpu(), e = elu(), tokens = usageMetrics(usage)
        const decodeMs = first !== null && finishAt !== null ? finishAt - first : null
        const elapsedMs = (finishAt ?? end) - started
        const status = finish?.kind ?? (options.signal?.aborted ? 'aborted' : threw ? 'thrown' : exhausted ? 'missing-finish' : 'consumer-closed')
        write({ kind: 'call-end', ...identity, endedAt: wall(), status, failureCode: finish?.failure?.code ?? null,
          httpStatus: number(finish?.failure?.status), usageAvailable: usage !== undefined, ...tokens,
          contextOccupancy: ratio(tokens.contextTokens, contextWindow), elapsedMs, streamLifetimeMs: end - started,
          ttftMs: first === null ? null : first - started, firstTextMs: firstText === null ? null : firstText - started,
          decodeMs, contentSpanMs: last !== null && first !== null ? last - first : null,
          decodeTps: ratio(tokens.outputTokens === null ? null : tokens.outputTokens * 1000, decodeMs),
          endToEndTps: ratio(tokens.outputTokens === null ? null : tokens.outputTokens * 1000, elapsedMs),
          chunkCount, contentChunks, outputTextChars, outputReasoningChars, outputToolArgumentChars, outputToolCalls: toolIndexes.size,
          ...gap.result(), consumerWaitMs, consumerWaitMaxMs, activeAtStart, maxConcurrent: concurrency.peak,
          processCpuMs: (c.user - processCpu.user + c.system - processCpu.system) / 1000,
          processElu: ratio(e.active - processElu.active, e.active - processElu.active + e.idle - processElu.idle),
          rssStartBytes: rssStart, rssEndBytes: memory() })
        active--; inflight.delete(concurrency)
      }
    })()
  }
  return { onEvent, stream, stop() { stopped = true; steps.clear(); contexts.clear(); tools.clear() } }
}
