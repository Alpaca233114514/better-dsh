import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { createObserver } from './core.mjs'
import { createSink } from './storage.mjs'

export const name = 'dsh-observer'
export const inject = ['llm']
export function apply(ctx) {
  const root = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'state', 'dsh-observer')
  const sink = createSink(root, { warn: message => ctx.logger.warn(message) })
  const observer = createObserver({ emit: sink.write, isLoopRequest: isAgentLoopRequest })
  sink.write({ schemaVersion: 1, kind: 'recorder-start', time: Date.now(), version: '0.1.2', pid: process.pid, node: process.version })
  ctx.on('session/event', (session, event) => observer.onEvent(session, event), { global: true })
  ctx.on('session/disposed', session => observer.onEvent(session, { type: 'session/disposed' }), { global: true })
  ctx.on('llm/stream', (options, next) => observer.stream(options, next), { global: true })
  const timer = setInterval(() => { void sink.flush() }, 250)
  timer.unref()
  ctx.effect(() => async () => {
    clearInterval(timer)
    observer.stop()
    sink.write({ schemaVersion: 1, kind: 'recorder-stop', time: Date.now() })
    await sink.close()
  })
  ctx.logger.info(`DSHObserver recording: ${sink.file}`)
}
