import test from 'node:test'
import assert from 'node:assert/strict'
import { load, store } from './loader.mjs'
const { installActions, adjacentSession, latestReply, defaults } = await load('../src/actions.ts')
const makeRow = (id, cwd = 'a', extra = {}) => ({ id, cwd, blank: false, retainedBy: {}, running: false, ...extra })
function fixture() {
  const commands = new Map(), calls = [], notices = []
  const list = store({ ids: ['a', 'b', 'c'], byId: { a: makeRow('a', 'a', { retainedBy: { mainView: 1 } }), b: makeRow('b'), c: makeRow('c', 'other') }, phase: 'ready' })
  const input = { state: store({ draft: '草稿保留' }), focus: () => calls.push('focus'), notify: (...args) => notices.push(args) }
  const session = Object.assign(store({ running: true, removed: false }), { cancel: async () => { calls.push('cancel:a'); return { ok: true } } })
  const binding = { sessionId: 'a', ctx: {}, session }
  const ctx = {
    shortcuts: { register(c) { commands.set(c.id, c); return () => commands.delete(c.id) } },
    sessions: { list, binding: id => id === 'a' ? binding : undefined },
    workspaces: { list: store({ items: [{ sessionIds: ['a', 'b'] }], archivedSessionIds: [], phase: 'ready' }) },
    conversation: { input: { for: () => input } },
    uiConversation: { binding: () => ({ target: () => store(undefined) }) },
    uiWorkspace: { openSession: id => calls.push(`open:${id}`), pinSession: async id => calls.push(`pin:${id}`), unpinSession: async id => calls.push(`unpin:${id}`) },
    layout: { panelInfo: store({ activePanelId: null }), selectPanel: () => calls.push('chat') },
  }
  let config = defaults
  const dispose = installActions(ctx, () => config, { writeText: async text => calls.push(`copy:${text}`) })
  const resolve = (id, context = { region: 'page', modal: null }) => commands.get(`dshkey.${id}`).resolve(context)
  return { ctx, commands, calls, notices, input, binding, dispose, resolve, setConfig: value => { config = value } }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('navigation follows host order, excludes subagents and blank sessions, respects workspace and wrap', () => {
  const list = { ids: ['a', 'archived', 'blank', 'child', 'other', 'b'], byId: { a: makeRow('a'), archived: makeRow('archived'), blank: makeRow('blank', 'a', { blank: true }), child: makeRow('child', 'a', { parentId: 'a' }), other: makeRow('other', 'a'), b: makeRow('b') }, phase: 'ready' }
  const workspaces = { items: [{ sessionIds: ['a', 'archived', 'blank', 'child', 'b'] }, { sessionIds: ['other'] }], archivedSessionIds: ['archived'], phase: 'ready' }
  assert.equal(adjacentSession(list, list.byId.a, 1, defaults, workspaces), 'b')
  assert.equal(adjacentSession(list, list.byId.a, -1, defaults, workspaces), 'b')
  assert.equal(adjacentSession(list, list.byId.a, -1, { ...defaults, wrapSessions: false }, workspaces), undefined)
  assert.equal(adjacentSession(list, list.byId.a, 1, { ...defaults, sameWorkspace: false }, workspaces), 'other')
  assert.equal(adjacentSession(list, makeRow('unknown'), 1, defaults, workspaces), undefined)
  assert.equal(adjacentSession(list, list.byId.a, 1, defaults, { ...workspaces, phase: 'pending' }), undefined)
})
test('copy uses latest settled visible assistant-step text, excludes reasoning, tools and streaming', () => {
  const nodes = new Map([
    ['one', { kind: 'assistant-step', visibility: 'visible', data: { status: 'settled', blocks: [{ kind: 'reasoning', text: 'private' }, { kind: 'text', text: 'Answer' }, { kind: 'text', text: 'Two' }] } }],
    ['tool', { kind: 'tool', visibility: 'visible', data: {} }],
    ['hidden', { kind: 'assistant-step', visibility: 'hidden', data: { blocks: [{ kind: 'text', text: 'hidden' }] } }],
    ['stream', { kind: 'assistant-step', visibility: 'visible', data: { status: 'running', blocks: [{ kind: 'text', text: 'partial' }] } }],
  ])
  assert.equal(latestReply({ order: [...nodes.keys()], nodes }), 'Answer\n\nTwo')
  assert.equal(latestReply(), undefined)
})
test('actions register and dispose cleanly; disabled plugin, terminal, modals and panels do not act', () => {
  const f = fixture()
  assert.equal(f.commands.size, 9)
  assert.equal(f.resolve('focusInput', { region: 'terminal', modal: null }).status, 'blocked')
  assert.equal(f.resolve('stop', { region: 'page', modal: 'approval' }).status, 'blocked')
  f.ctx.layout.panelInfo.set({ activePanelId: 'other' })
  assert.equal(f.resolve('stop').status, 'blocked')
  f.resolve('returnChat').run()
  f.setConfig({ ...defaults, enabled: false })
  assert.equal(f.resolve('focusInput').status, 'pass')
  f.dispose(); assert.equal(f.commands.size, 0)
  assert.deepEqual(f.calls, ['chat'])
})
test('focus and switching call public services without altering draft', () => {
  const f = fixture()
  f.resolve('focusInput').run(); f.resolve('next').run()
  assert.deepEqual(f.calls, ['focus', 'open:b'])
  assert.equal(f.input.state.getSnapshot().draft, '草稿保留')
})
test('cancel captures original session and reports server denial', async () => {
  const f = fixture()
  const target = f.resolve('stop')
  f.ctx.sessions.list.set({ ids: [], byId: {}, phase: 'ready' })
  f.binding.session.cancel = async () => ({ ok: false, error: { message: 'read-only' } })
  target.run(); await settle()
  assert.match(f.notices[0][1], /read-only/)
  assert.equal(f.notices[0][0], 'error')
})
test('pin/unpin share a busy fence and use captured session id', async () => {
  const f = fixture()
  let finish
  f.ctx.uiWorkspace.pinSession = id => { f.calls.push(`pin:${id}`); return new Promise(resolve => { finish = resolve }) }
  f.resolve('pin').run()
  assert.equal(f.resolve('unpin').status, 'blocked')
  finish(); await settle()
  f.resolve('unpin').run(); await settle()
  assert.deepEqual(f.calls, ['pin:a', 'unpin:a'])
})
test('clipboard writes captured draft, reports failure, and permits retry', async () => {
  const f = fixture()
  const captured = f.resolve('copyDraft')
  f.input.state.set({ draft: 'new' }); captured.run(); await settle()
  assert.deepEqual(f.calls, ['copy:草稿保留'])
  f.dispose()
  const dispose = installActions(f.ctx, () => defaults, { writeText: async () => { throw new Error('denied') } })
  f.resolve('copyDraft').run(); await settle()
  assert.match(f.notices.at(-1)[1], /denied/)
  assert.equal(f.resolve('copyDraft').status, 'handled'); dispose()
})
test('no running session refuses stop; removed binding refuses all session actions', () => {
  const f = fixture()
  f.binding.session.set({ running: false, removed: false })
  assert.equal(f.resolve('stop').status, 'blocked')
  f.binding.session.set({ running: false, removed: true })
  assert.equal(f.resolve('pin').status, 'blocked')
})
test('partial registration failure releases prior commands', () => {
  let removed = 0, n = 0
  const ctx = { shortcuts: { register() { if (++n === 4) throw new Error('collision'); return () => removed++ } } }
  assert.throws(() => installActions(ctx, () => defaults), /collision/)
  assert.equal(removed, 3)
})
