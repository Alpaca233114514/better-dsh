import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'

await mkdir('.test-build', { recursive: true })
const external = ['react', 'react/*', 'react-dom', 'react-dom/*', 'zod']
await Promise.all([
  build({ entryPoints: ['src/launcher.tsx'], outfile: '.test-build/polling-launcher.mjs', bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external }),
  build({ entryPoints: ['src/panel.tsx'], outfile: '.test-build/polling-panel.mjs', bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external }),
  build({ entryPoints: ['src/client.tsx'], outfile: '.test-build/polling-client.mjs', bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external, loader: { '.css': 'text' } }),
])

const dom = new JSDOM('<!doctype html><body><main data-phase="active"><header><div id="entry"></div></header><div data-conversation-content=""></div></main></body>', { url: 'http://localhost' })
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(document, 'hidden', { value: false, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
Object.defineProperty(document.querySelector('main'), 'clientWidth', { value: 1200 })
const { GitLauncher } = await import('../.test-build/polling-launcher.mjs')
const { GitPanel } = await import('../.test-build/polling-panel.mjs')
const { apply } = await import('../.test-build/polling-client.mjs')
const { createRoot } = await import('react-dom/client')
const tick = () => new Promise(resolve => setImmediate(resolve))
const state = { root: '/project', name: 'project', branch: 'codex/stream', upstream: '', ahead: 0, behind: 0,
  additions: 1, deletions: 0, files: [], protected: false, writable: true }

function recorder(handler) {
  const calls = []
  let active = 0, peak = 0, subscriptions = 0, closed = 0
  return {
    calls,
    get peak() { return peak },
    get subscriptions() { return subscriptions },
    get closed() { return closed },
    // A new object on every call models Cordis returning a fresh service proxy.
    remote() {
      return { async *changes(_sessionId, signal) {
        subscriptions++
        try { yield { changed: true }; if (!signal.aborted) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) }
        finally { closed++ }
      }, async run(request) {
        calls.push(request.action)
        active++; peak = Math.max(peak, active)
        try {
          await tick()
          return handler ? handler(request) : { ok: true, value: { state: structuredClone(state) } }
        } finally { active-- }
      } }
    },
  }
}

test('header re-renders with a fresh remote proxy do not restart the Git change subscription', async () => {
  const rec = recorder()
  const element = document.createElement('div')
  document.getElementById('entry').append(element)
  const root = createRoot(element)
  function Parent() { return React.createElement(GitLauncher, { sessionId: 'stream', remote: rec.remote() }) }
  for (let i = 0; i < 40; i++) {
    await act(async () => { root.render(React.createElement(Parent)); await new Promise(resolve => setTimeout(resolve, 1)) })
  }
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  assert.equal(rec.calls.filter(action => action === 'state').length, 1)
  assert.equal(rec.peak, 1)
  assert.equal(rec.subscriptions, 1)
  assert.match(document.querySelector('.dg-sidebar').textContent, /codex\/stream/)
  await act(async () => root.unmount())
  element.remove()
})

test('detail ticks with a fresh remote proxy do not refetch state, branches or PR', async () => {
  const rec = recorder(request => {
    if (request.action === 'prInfo') return { ok: true, value: { pr: null, base: 'main' } }
    if (request.action === 'branches') return { ok: true, value: { branches: ['main', 'codex/stream'] } }
    return { ok: true, value: { state: structuredClone(state) } }
  })
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  function Parent() { return React.createElement(GitPanel, { sessionId: 'stream', remote: rec.remote(), onClose() {} }) }
  for (let i = 0; i < 20; i++) {
    await act(async () => { root.render(React.createElement(Parent)); await tick() })
  }
  await act(async () => { await tick() })
  for (const action of ['state', 'prInfo', 'branches']) {
    assert.equal(rec.calls.filter(call => call === action).length, 1, `${action} must load once`)
  }
  await act(async () => root.unmount())
  element.remove()
})

test('client resolves the service proxy once instead of on every header render', async () => {
  let Entry, serviceGets = 0
  const service = { async *changes(_sessionId, signal) { yield { changed: true }; await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) }, async run() { return { ok: true, value: { state: structuredClone(state) } } } }
  const scope = {
    remote: new Proxy({}, { get(_target, property) { if (property === 'dshgit') { serviceGets++; return service } } }),
    slots: { inject(_name, setup) { setup() }, register(_meta, component) { Entry = component } },
  }
  const ctx = {
    remote: { async $mount() {} },
    effect(setup) { setup(); return () => {} },
    inject(_deps, setup) { setup(scope) },
  }
  await apply(ctx)
  assert.equal(typeof Entry, 'function')
  const element = document.createElement('div')
  document.getElementById('entry').append(element)
  const root = createRoot(element)
  const render = () => act(async () => { root.render(React.createElement(Entry, { sessionId: 'stream' })); await tick() })
  await render()
  const afterMount = serviceGets
  for (let i = 0; i < 3; i++) await render()
  assert.equal(serviceGets, afterMount, 'header renders must not re-read the service proxy')
  await act(async () => root.unmount())
  element.remove()
})

test.after(() => dom.window.close())
