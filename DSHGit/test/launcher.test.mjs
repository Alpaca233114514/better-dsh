import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'

await mkdir('.test-build', { recursive: true })
await build({ entryPoints: ['src/launcher.tsx'], outfile: '.test-build/launcher.mjs', bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'zod'] })
const dom = new JSDOM('<!doctype html><body><main data-phase="active"><div><header><div id="entry"></div></header></div><div id="body-slot"></div></main></body>', { url: 'http://localhost' })
globalThis.window = dom.window; globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.MutationObserver = dom.window.MutationObserver
let resize, disconnected = false
globalThis.ResizeObserver = class {
  constructor(callback) { resize = callback }
  observe() {}
  disconnect() { disconnected = true }
}
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const { createRoot } = await import('react-dom/client')
const { GitLauncher } = await import('../.test-build/launcher.mjs')
const host = document.querySelector('main'), content = document.createElement('div')
content.setAttribute('data-conversation-content', '')
content.innerHTML = '<textarea>unsent draft</textarea>'
let width = 0
Object.defineProperty(host, 'clientWidth', { get: () => width })
const root = createRoot(document.getElementById('entry'))
const calls = []
const remote = { async run(request) {
  calls.push(request)
  return { ok: true, value: { state: { root: '/project', name: 'project', branch: 'codex/test', upstream: '', ahead: 0, behind: 0, additions: 3, deletions: 1, protected: false, writable: true, files: [] }, branches: ['codex/test'], pr: null, base: 'main' } }
} }
const tick = () => new Promise(resolve => setImmediate(resolve))
const click = async selector => act(async () => { document.querySelector(selector).click(); await tick() })

test('card reserves only its own conversation and collapses without losing the composer draft', async () => {
  await act(async () => { root.render(React.createElement(GitLauncher, { sessionId: 'one', remote })); await tick() })
  await act(async () => { document.getElementById('body-slot').append(content); await tick() })
  width = 1200
  await act(async () => resize())
  assert.equal(document.querySelector('aside').parentElement, host)
  assert.equal(host.classList.contains('dg-host'), true)
  assert.equal(content.classList.contains('dg-conversation-body'), true)
  assert.equal(host.getAttribute('data-dg-wide'), 'true')
  assert.deepEqual(calls.map(call => call.action), ['state'])
  await click('.dg-launcher')
  assert.equal(host.classList.contains('dg-host'), false)
  assert.equal(content.classList.contains('dg-conversation-body'), false)
  assert.equal(document.querySelector('aside'), null)
  assert.equal(content.querySelector('textarea').value, 'unsent draft')
  await click('.dg-launcher')
  width = 700
  await act(async () => resize())
  assert.equal(host.getAttribute('data-dg-wide'), 'false')
  assert.equal(document.querySelector('aside'), null)
  assert.equal(content.querySelector('textarea').value, 'unsent draft')
  width = 1200
  await act(async () => resize())
  assert.ok(document.querySelector('aside'), 'returning to a wide column restores the default card')
  width = 700
  await act(async () => resize())
  await click('.dg-launcher')
  assert.ok(document.querySelector('aside'))
})

test('detail opens from card; Escape returns focus and unmount releases host layout', async () => {
  await click('.dg-sidebar-changes')
  const dialog = document.querySelector('dialog')
  assert.equal(dialog.hasAttribute('open'), true)
  assert.ok(document.querySelector('.dg-workspace'))
  await act(async () => { dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true })); await tick() })
  assert.equal(dialog.hasAttribute('open'), false)
  assert.equal(document.activeElement, document.querySelector('.dg-sidebar-changes'))
  await act(async () => root.unmount())
  assert.equal(host.classList.contains('dg-host'), false)
  assert.equal(host.hasAttribute('data-dg-wide'), false)
  assert.equal(host.style.getPropertyValue('--dg-header-height'), '')
  assert.equal(disconnected, true)
  assert.equal(content.querySelector('textarea').value, 'unsent draft')
  assert.equal(calls.every(call => ['state', 'branches', 'prInfo'].includes(call.action)), true)
})
test.after(() => dom.window.close())
