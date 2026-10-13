import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'

export async function source(name) {
  const output = await build({ entryPoints: [fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node' })
  return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'))
}

export const flush = () => new Promise(resolve => setImmediate(resolve))
export function makeClock() {
  let now = 0, id = 0, starts = 0
  const timers = new Map()
  return {
    now: () => now,
    start(fn, ms) { timers.set(++id, { fn, ms }); starts++; return id },
    stop(id) { timers.delete(id) },
    advance(ms) { now += ms; for (const { fn } of [...timers.values()]) fn() },
    get size() { return timers.size }, get starts() { return starts },
  }
}

// A contract fixture, not a substitute for the separate real-upstream integration test.
export function addRow(doc, { running = true, kind = 'assistant-step', text = 'Think', malformed = false } = {}) {
  const item = doc.createElement('div')
  item.dataset.chatFlowKind = kind
  item.innerHTML = `<div data-variant="think" data-state="${running ? 'running' : 'ok'}">
    <div data-disclosure-header><div data-disclosure-row role="button" tabindex="0" aria-expanded="false">
      <span><svg aria-hidden="true"></svg></span>
      <span data-shimmer><span><span>${text}</span><span data-shimmer-decoration></span><span>Native preview</span></span>
      <span aria-hidden="true"><span><span data-shimmer-text="Think"></span></span></span></span>
    </div></div><div data-slot="conversation.chat.reasoning.body"><p>Original **reasoning**</p></div>
  </div>`
  if (malformed) item.querySelector('[data-disclosure-row]').removeAttribute('role')
  doc.body.append(item)
  return { item, row: item.querySelector('[data-variant]'), header: item.querySelector('[data-disclosure-row]'),
    body: item.querySelector('[data-slot]'), title: item.querySelector('[data-shimmer] > span > span') }
}

export function dom() {
  const env = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true })
  const events = new Set()
  const media = { matches: false, addEventListener: (_name, fn) => events.add(fn), removeEventListener: (_name, fn) => events.delete(fn) }
  env.window.matchMedia = () => media
  return { ...env, window: env.window, close: () => env.window.close(),
    reduce(value) { media.matches = value; for (const fn of events) fn() }, mediaListeners: events }
}
