import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'

await mkdir('.test-build', { recursive: true })
await build({ stdin: { contents: "export { GitPanel } from './src/panel.tsx'; export { GitNotifications } from './src/notifications.tsx'; export { getNotices, dismissNotice } from './src/operations.ts'", resolveDir: process.cwd() }, outfile: '.test-build/background.mjs', bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react/*', 'zod'] })
const dom = new JSDOM('<!doctype html><body><div id="panel"></div><div id="notifications"></div></body>', { url: 'http://localhost' })
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(document, 'hidden', { value: false, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const { GitPanel, GitNotifications, getNotices, dismissNotice } = await import('../.test-build/background.mjs')
const panel = createRoot(document.getElementById('panel')), notices = createRoot(document.getElementById('notifications'))
const tick = () => new Promise(resolve => setImmediate(resolve))
const state = { root: '/project', name: 'project', branch: 'codex/test', upstream: '', ahead: 1, behind: 0, additions: 0, deletions: 0, protected: false, writable: true, files: [] }
const click = async selector => act(async () => { document.querySelector(selector).click(); await tick() })

for (const outcome of ['success', 'error', 'partial']) {
  const fails = outcome !== 'success'
  test(`background ${outcome} survives closing and reopening the tab`, async () => {
    let finish, mutations = 0
    const pending = new Promise(resolve => { finish = resolve })
    const remote = { async run(request) {
      if (request.action === 'push') { mutations++; return pending }
      return { ok: true, value: { state: structuredClone(state), branches: ['codex/test'] } }
    } }
    const render = () => panel.render(React.createElement(GitPanel, { sessionId: 'background', remote, onClose() {} }))
    await act(async () => { notices.render(React.createElement(GitNotifications)); render(); await tick() })
    await click('.dg-footer button')
    await click('.dg-commit-actions button')
    assert.equal(document.querySelector('.dg-commit-card'), null)
    await act(async () => { panel.render(null); await tick() })
    await act(async () => { render(); await tick() })
    // A newly mounted body still observes the shared in-flight lock.
    // 新标签页仍须继承执行锁，不能再次提交同一操作。
    assert.equal(mutations, 1)
    assert.match(document.querySelector('.dg-empty').textContent, /正在读取/)
    await act(async () => { panel.render(null); await tick() })
    await act(async () => {
      finish(outcome === 'partial' ? { ok: true, value: { partialFailure: true, notice: '提交已完成，但推送失败，请单独推送' } } : fails ? { ok: false, error: { message: '提交已完成，但推送失败，请单独推送' } } : { ok: true, value: { notice: '推送成功' } })
      await tick()
    })
    assert.match(document.querySelector('.dg-toast').textContent, fails ? /project.*提交已完成，但推送失败/ : /project.*推送成功/)
    assert.equal(document.querySelector('.dg-toast').getAttribute('role'), fails ? 'alert' : 'status')
    await act(async () => { render(); await tick() })
    assert.equal(document.querySelector('.dg-footer button').disabled, false)
    await act(async () => { for (const item of getNotices()) dismissNotice(item.id); panel.render(null); await tick() })
  })
}
test.after(async () => { await act(async () => { panel.unmount(); notices.unmount() }); dom.window.close() })
