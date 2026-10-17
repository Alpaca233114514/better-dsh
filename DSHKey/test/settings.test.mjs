import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { load, store } from './loader.mjs'
const { Settings } = await load('../src/settings.tsx')

async function mount() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const form = Object.assign(store({ status: 'ready', value: { enabled: true, sameWorkspace: true, wrapSessions: true }, revision: 2, writable: true }), {
    mutate: async () => true,
  })
  const edits = [], recordings = []
  const row = { id: 'dshkey.focusInput', label: '聚焦输入框', aliases: [], binding: { code: 'KeyL', modifiers: ['control', 'alt', 'shift'] }, keys: ['Ctrl', 'Alt', 'Shift', 'L'], modified: false, conflicts: [], issue: null }
  const shortcuts = { runtime: 'web', platform: 'windows', catalog: store([row]), fixedCatalog: store([]), config: store({ status: 'ready', revision: 'r1' }),
    describeBinding(binding) { return { binding, keys: binding ? [...binding.modifiers, binding.code] : [], issue: null, conflicts: binding?.code === 'KeyK' ? ['other.action'] : [] } },
    recording: async active => { recordings.push(active) },
    edit: async (edit, revision) => { edits.push({ edit, revision }); return { status: 'saved', snapshot: shortcuts.config.getSnapshot() } },
  }
  const root = createRoot(document.getElementById('root'))
  await act(async () => root.render(React.createElement(Settings, { form, shortcuts })))
  const click = async element => { assert.ok(element); await act(async () => element.click()) }
  const button = label => [...document.querySelectorAll('button')].find(el => el.textContent === label || el.getAttribute('aria-label') === label)
  const open = () => click(button('修改 聚焦输入框 快捷键'))
  const key = async (code, key, extra = {}) => act(async () => button('录制组合键').dispatchEvent(new dom.window.KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ctrlKey: true, altKey: true, shiftKey: true, ...extra })))
  return { dom, form, shortcuts, edits, recordings, click, button, open, key, async cleanup() { await act(async () => root.unmount()); dom.window.close() } }
}

test('settings records a combination and saves with the reviewed revision; cleanup restores native accelerators', async () => {
  const f = await mount()
  try {
    await f.open(); await f.click(f.button('录制组合键')); await f.key('KeyM', 'M')
    await f.click(f.button('保存键位'))
    assert.deepEqual(f.edits, [{ edit: { type: 'set', id: 'dshkey.focusInput', binding: { code: 'KeyM', modifiers: ['control', 'alt', 'shift'] } }, revision: 'r1' }])
    assert.deepEqual(f.recordings, [true, false])
    assert.equal(document.querySelector('.dk-editor'), null)
  } finally { await f.cleanup() }
})
test('conflicts and stale revisions prevent writes without losing the draft', async () => {
  const f = await mount()
  try {
    await f.open(); await f.click(f.button('录制组合键')); await f.key('KeyK', 'K')
    assert.equal(f.button('保存键位').disabled, true)
    assert.match(document.querySelector('.dk-editor').textContent, /冲突/)
    await f.click(f.button('录制组合键')); await f.key('KeyM', 'M')
    await act(async () => f.shortcuts.config.set({ status: 'ready', revision: 'r2' }))
    assert.equal(f.button('保存键位').disabled, true)
    assert.match(document.querySelector('.dk-editor').textContent, /其他窗口/)
    assert.equal(f.edits.length, 0)
  } finally { await f.cleanup() }
})
test('IME and repeats do not replace bindings; failed save keeps editor open', async () => {
  const f = await mount()
  try {
    await f.open(); await f.click(f.button('录制组合键'))
    await f.key('KeyM', 'Process', { isComposing: true }); await f.key('KeyM', 'M', { repeat: true })
    f.shortcuts.edit = async () => ({ status: 'write-failed' })
    await f.click(f.button('保存键位'))
    assert.ok(document.querySelector('.dk-editor'))
    assert.match(document.querySelector('.dk-editor').textContent, /保存失败/)
  } finally { await f.cleanup() }
})
test('Host preferences respect writable state and submit exact namespace revision', async () => {
  const f = await mount()
  try {
    const calls = []
    f.form.mutate = async (...args) => { calls.push(args); return false }
    await f.click(document.querySelector('[role=switch]'))
    assert.deepEqual(calls, [[[ { op: 'set', path: ['enabled'], value: false } ], 2]])
    assert.match(document.querySelector('.dk-root').textContent, /未保存/)
    await act(async () => f.form.set({ ...f.form.getSnapshot(), writable: false }))
    assert.equal(document.querySelector('[role=switch]').disabled, true)
  } finally { await f.cleanup() }
})
