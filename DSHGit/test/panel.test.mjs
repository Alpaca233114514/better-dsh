import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
await mkdir('.test-build', { recursive: true })
await build({ entryPoints: ['src/panel.tsx'], outfile: '.test-build/panel.mjs', bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/*', 'zod'] })
const { GitPanel } = await import('../.test-build/panel.mjs')
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost' })
globalThis.window = dom.window; globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const root = createRoot(document.getElementById('root'))
const tick = () => new Promise(resolve => setImmediate(resolve))
const byText = text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text)
const click = async button => { assert.ok(button); await act(async () => { button.click(); await tick() }) }
async function mount(overrides = {}, handler) {
  const calls = [], state = { root: '/project', name: 'project', branch: 'codex/test', upstream: '', ahead: 0, behind: 0,
    additions: 10, deletions: 2, protected: false, writable: true, files: [{ path: 'hello.ts', index: 'M', worktree: ' ' }], ...overrides }
  const remote = { async run(request) {
    calls.push(request)
    const custom = handler?.(request); if (custom) return custom
    if (request.action === 'prInfo') return { ok: true, value: { pr: null, base: 'main' } }
    if (request.action === 'branches') return { ok: true, value: { branches: ['main', 'codex/test'] } }
    if (request.action === 'diff') return { ok: true, value: { text: '+new\n-old\n' } }
    return { ok: true, value: { state: structuredClone(state) } }
  } }
  await act(async () => { root.render(null); await tick() })
  await act(async () => { root.render(React.createElement(GitPanel, { sessionId: 'test', remote, onClose() {} })); await tick() })
  return calls
}
test('changes entry displays real statistics and opens per-file diff', async () => {
  await mount()
  assert.match(document.body.textContent, /\+10/)
  await click(document.querySelector('.dg-file-name'))
  assert.match(document.querySelector('pre').textContent, /\+new\n-old/)
})
test('Ctrl+Enter commits with the current include-unstaged selection', async () => {
  const calls = await mount()
  await click(byText('提交与推送'))
  assert.equal(document.activeElement.getAttribute('aria-label'), '提交信息')
  await click(document.querySelector('.dg-check input'))
  await act(async () => { document.querySelector('.dg-message').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await tick() })
  assert.equal(calls.find(call => call.action === 'commit').includeUnstaged, false)
  assert.equal(document.querySelector('.dg-commit-card'), null)
})
test('operation error survives the successful state refresh', async () => {
  await mount({}, request => request.action === 'push' ? { ok: false, error: { message: 'remote denied' } } : null)
  await click(byText('提交与推送')); await click(byText('推送'))
  assert.match(document.querySelector('[role="alert"]').textContent, /remote denied/)
})
test('protected and read-only repositories disable commit and push', async () => {
  await mount({ branch: 'main', protected: true })
  await click(byText('提交与推送'))
  assert.equal(byText('推送').disabled, true)
  assert.equal(document.querySelector('.dg-commit-actions button').disabled, true)
  await mount({ writable: false })
  await click(byText('提交与推送'))
  assert.equal(byText('推送').disabled, true)
})
test('PR entry exposes title, description, base and draft form', async () => {
  const calls = await mount()
  await click([...document.querySelectorAll('button')].find(b => b.textContent.includes('创建 Pull Request')))
  assert.ok(document.querySelector('form'))
  assert.equal(document.querySelector('input').value, 'main')
  assert.ok(document.querySelector('textarea'))
  assert.ok(calls.some(call => call.action === 'prInfo'))
})
test('Escape closes commit surface and restores focus', async () => {
  await mount()
  const trigger = byText('提交与推送')
  await click(trigger)
  await act(async () => { document.querySelector('.dg-message').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await tick() })
  assert.equal(document.querySelector('.dg-commit-card'), null)
  assert.equal(document.activeElement, trigger)
})
test.after(async () => { await act(async () => root.unmount()); dom.window.close() })
