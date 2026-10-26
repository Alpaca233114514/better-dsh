// Client-half harness: drives the real client.js in a fake browser.
//
// client.js is NOT imported — it references window.__ModuleLoader__ at the
// top level — so its source is read and executed through `new Function`
// against fake globals, with a tiny fake React implementation underneath.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let failures = 0

function fail(name, message) {
  failures += 1
  console.error(`FAIL ${name}: ${message}`)
}

function ok(value, name, message) {
  if (!value) fail(name, message ?? 'expected truthy')
}

function equal(actual, expected, name, message) {
  if (!Object.is(actual, expected)) {
    fail(name, message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
// Fake browser globals
// ---------------------------------------------------------------------------

const storage = new Map()

const windowListeners = new Map() // `${name}:${capture ? 1 : 0}` -> handler
const docListeners = new Map() // `${name}` -> handler
const intervalDelays = [] // shared log; roots also record their own
let currentRoot = null

const composerNode = {
  tagName: 'DIV',
  isContentEditable: true,
  innerText: '',
  textContent: '',
  firstElementChild: null,
  style: {},
  getBoundingClientRect() {
    return { ...composerNode.rect }
  },
  rect: { left: 40, top: 100, width: 320, height: 26, right: 360, bottom: 126 },
  parentElement: null, // assigned below
}

const placeholderNode = {
  style: {},
  getBoundingClientRect() {
    return { ...placeholderNode.rect }
  },
  rect: { left: 52, top: 101, width: 200, height: 22, right: 252, bottom: 123 },
}

const composerWrapper = {
  querySelector(selector) {
    return selector === '[data-composer-placeholder]' ? placeholderNode : null
  },
}
composerNode.parentElement = composerWrapper

const fakeDocument = {
  documentElement: { lang: 'zh-CN' },
  baseURI: 'http://127.0.0.1:54321/',
  visibilityState: 'visible',
  hasFocus: () => true,
  body: {},
  querySelector(selector) {
    return selector === '[contenteditable="true"]' ? composerNode : null
  },
  addEventListener(name, handler) {
    docListeners.set(name, handler)
  },
  removeEventListener(name) {
    docListeners.delete(name)
  },
}

const fakeNavigator = { languages: ['zh-CN'], language: 'zh-CN' }

const fakeWindow = {
  localStorage: {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: key => { storage.delete(key) },
    clear: () => { storage.clear() },
  },
  getComputedStyle() {
    return {
      paddingLeft: '12px',
      paddingTop: '12px',
      fontSize: '15px',
      lineHeight: '22px',
      fontFamily: 'system-ui',
      fontWeight: '400',
    }
  },
  setInterval(fn, delay) {
    intervalDelays.push(delay)
    if (currentRoot) currentRoot.intervals.push(delay)
    return intervalDelays.length
  },
  clearInterval() {},
  addEventListener(name, handler, capture) {
    windowListeners.set(`${name}:${capture ? 1 : 0}`, handler)
  },
  removeEventListener(name, handler, capture) {
    windowListeners.delete(`${name}:${capture ? 1 : 0}`)
  },
  dispatchEvent(event) {
    const handler = windowListeners.get(`${event.type}:0`)
    if (handler) handler(event)
    return true
  },
}

class FakeCustomEvent {
  constructor(type, params) {
    this.type = type
    this.detail = params?.detail
  }
}

// ---------------------------------------------------------------------------
// Fake React
// ---------------------------------------------------------------------------

function makeFakeReact() {
  const createElement = (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false && child !== true),
  })
  return {
    createElement,
    useCallback: fn => fn,
    useMemo: factory => factory(),
  }
}

const baseReact = makeFakeReact()

// A root owns its hook slots so state survives across render passes.
function createRoot(Component, props) {
  const rootState = { intervals: [], hooks: [], pendingEffects: [], cleanups: [] }
  let hookIndex = 0
  let dirty = false

  const React = {
    ...baseReact,
    useState(initial) {
      const slot = rootState.hooks[hookIndex] ?? {
        state: { value: typeof initial === 'function' ? initial() : initial },
      }
      slot.state = slot.state ?? { value: typeof initial === 'function' ? initial() : initial }
      rootState.hooks[hookIndex] = slot
      const index = hookIndex
      hookIndex += 1
      const setState = next => {
        slot.state.value = typeof next === 'function' ? next(slot.state.value) : next
        dirty = true
      }
      return [slot.state.value, setState]
    },
    useRef(initial) {
      const slot = rootState.hooks[hookIndex] ?? { ref: { current: initial } }
      rootState.hooks[hookIndex] = slot
      hookIndex += 1
      return slot.ref
    },
    useEffect(effect, deps) {
      const slot = rootState.hooks[hookIndex] ?? { effect: { deps: undefined, cleanup: undefined } }
      rootState.hooks[hookIndex] = slot
      const index = hookIndex
      hookIndex += 1
      const previous = slot.effect.deps
      const changed = deps === undefined
        || previous === undefined
        || previous.length !== deps.length
        || deps.some((dep, position) => !Object.is(dep, previous[position]))
      if (changed) {
        slot.effect.deps = deps
        rootState.pendingEffects.push(() => {
          if (typeof slot.effect.cleanup === 'function') slot.effect.cleanup()
          const cleanup = effect()
          slot.effect.cleanup = typeof cleanup === 'function' ? cleanup : undefined
          rootState.cleanups[index] = slot.effect.cleanup
        })
      }
    },
  }

  function renderPass() {
    hookIndex = 0
    dirty = false
    rootState.tree = Component(props)
    const effects = rootState.pendingEffects.splice(0)
    for (const effect of effects) effect()
    return rootState.tree
  }

  return {
    React,
    props,
    intervals: rootState.intervals,
    renderPass,
    async mount() {
      const previous = currentRoot
      currentRoot = this
      this.renderPass()
      await sleep(5) // let fetch promises settle
      this.renderPass()
      this.renderPass()
      currentRoot = previous
    },
    async refresh() {
      const previous = currentRoot
      currentRoot = this
      this.renderPass()
      await sleep(5) // let pending fetch continuations land their setState
      this.renderPass() // apply the new state; effects queue geometry work
      this.renderPass() // apply the geometry state
      currentRoot = previous
    },
    unmount() {
      for (const cleanup of rootState.cleanups) {
        if (typeof cleanup === 'function') cleanup()
      }
      rootState.cleanups = []
      rootState.tree = null
    },
    get tree() {
      return rootState.tree
    },
  }
}

// Depth-first walk that invokes function components and yields every element.
function* walk(node) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'function') {
    yield* walk(node.type(node.props))
    return
  }
  yield node
  for (const child of node.children ?? []) {
    if (typeof child === 'object') yield* walk(child)
    else if (child !== undefined && child !== null) yield { type: '#text', props: {}, children: [], text: String(child) }
  }
}

function findAll(tree, predicate) {
  const found = []
  for (const node of walk(tree)) {
    if (predicate(node)) found.push(node)
  }
  return found
}

function textOf(tree) {
  let text = ''
  for (const node of walk(tree)) {
    if (node.type === '#text') text += node.text
  }
  return text
}

// ---------------------------------------------------------------------------
// Fake fetch and host services
// ---------------------------------------------------------------------------

const CONFIG_DEFAULTS = { cacheTtlMs: 1800000, cacheMaxEntries: 200, preferredReasoningEffort: 'high', fallbackPollMs: 45000 }
let predictionText = 'HELLO_PREDICTION'
let predictionResponse = null
const fetchCalls = []
const fetchBodies = []

const fakeFetch = (url, options = {}) => {
  fetchCalls.push({ url: String(url), method: options.method ?? 'GET' })
  if (options.body !== undefined) fetchBodies.push({ url: String(url), body: JSON.parse(options.body) })
  let data
  if (url.includes('/next-suggestion/api/config')) {
    if ((options.method ?? 'GET') === 'POST') {
      data = { ok: true, values: { ...CONFIG_DEFAULTS, [fetchBodies[fetchBodies.length - 1].body.field]: fetchBodies[fetchBodies.length - 1].body.value }, fallbackPollMs: 45000 }
    } else {
      data = { values: { ...CONFIG_DEFAULTS }, editable: true, fallbackPollMs: 45000 }
    }
  } else if (url.includes('/next-suggestion/api/predict')) {
    if (predictionResponse) return predictionResponse(options)
    data = { text: predictionText }
  } else {
    data = { ok: true }
  }
  return Promise.resolve({ ok: true, json: async () => data })
}

const calls = { setDraft: [] }
const conversationService = {
  input: {
    shell: sessionId => ({
      setDraft: text => {
        calls.setDraft.push({ sessionId, text })
        inputState.draft = text // a real host turns the prediction into the draft
      },
    }),
  },
}

const registered = new Map()
const fakeHostCtx = {
  get: name => (name === 'conversation' ? conversationService : undefined),
  slots: {
    inject: (slot, callback) => callback(),
    register: (meta, component) => { registered.set(meta.key ?? meta.name, { meta, component }) },
  },
}

// ---------------------------------------------------------------------------
// Load the client module
// ---------------------------------------------------------------------------

const source = readFileSync(join(root, 'client.js'), 'utf8')

let loadedDeclaration = null
fakeWindow.__ModuleLoader__ = {
  load: declaration => { loadedDeclaration = declaration },
}

const inputState = { draft: '', attachmentIds: [], phase: 'plain' }

const requireShim = name => {
  if (name === 'react') return null // patched per root below
  if (name === 'react-dom') return { createPortal: node => node }
  throw new Error(`unexpected require: ${name}`)
}

// The module factory receives the root's React instance; re-run the factory
// per root would reload the module, so instead every root shares one React
// whose hooks are retargeted through the active root. Simplest faithful
// approach: a single module-level React with a swappable hook backend.
let activeRoot = null
const sharedReact = {
  ...baseReact,
  useState: (...args) => activeRoot.React.useState(...args),
  useRef: (...args) => activeRoot.React.useRef(...args),
  useEffect: (...args) => activeRoot.React.useEffect(...args),
}

new Function('window', 'document', 'navigator', 'fetch', 'CustomEvent', 'require', source)(
  fakeWindow, fakeDocument, fakeNavigator, fakeFetch, FakeCustomEvent,
  name => (name === 'react' ? sharedReact : requireShim(name)),
)

const clientModule = loadedDeclaration.factory
  ? loadedDeclaration.factory(name => (name === 'react' ? sharedReact : requireShim(name)))
  : null

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

function mountSuggestion(extraProps = {}) {
  const root = createRoot(registered.get('conversation.composer.dock').component, {
    sessionId: 'session-test',
    inputActions: conversationService.input.shell(extraProps.sessionId ?? 'session-test'),
    useInput: selector => selector(inputState),
    ...(extraProps.useInput === null ? { useInput: undefined } : {}),
    ...extraProps,
  })
  activeRoot = root
  return root
}

function ghostOf(tree) {
  return findAll(tree, node => node.props['data-dsh-next-suggestion'] !== undefined)[0] ?? null
}

function press(key, target = composerNode, modifiers = {}) {
  const handler = windowListeners.get('keydown:1')
  const event = {
    key,
    target,
    defaultPrevented: false,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
    preventDefault() { this.defaultPrevented = true },
    stopPropagation() {},
  }
  if (handler) handler(event)
  return event
}

function predictCalls() {
  return fetchCalls.filter(call => call.url.includes('/next-suggestion/api/predict'))
}

function predictBodies() {
  return fetchBodies.filter(entry => entry.url.includes('/next-suggestion/api/predict'))
}

function configPosts() {
  return fetchBodies.filter(entry => entry.url.includes('/next-suggestion/api/config'))
}

// ---------------------------------------------------------------------------
// 1. Module factory executes and registers all three slots
// ---------------------------------------------------------------------------

function group01() {
  ok(clientModule, 'module registers three slots', 'factory did not return a module')
  equal(clientModule.inject[0], 'slots', 'module registers three slots', 'inject list')
  ok(registered.get('conversation.composer.dock'), 'module registers three slots', 'composer dock slot missing')
  ok(registered.get('settings.general.item'), 'module registers three slots', 'settings slot missing')
  ok(registered.get('dsh-next-suggestion#next-suggestion'), 'module registers three slots', 'plugins config slot missing')
}

// 2. Ghost rendering on a pristine composer
// ---------------------------------------------------------------------------

let suggestionRoot = null

async function group02() {
  inputState.draft = ''
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  const ghost = ghostOf(suggestionRoot.tree)
  ok(ghost, 'ghost renders on a pristine composer', 'ghost node missing')
  equal(textOf(ghost), 'HELLO_PREDICTION按 Tab 接受', 'ghost renders on a pristine composer', 'ghost text or hint')
  equal(ghost.props.style.top, '101px', 'ghost renders on a pristine composer', 'placeholder line box top')
  equal(ghost.props.style.lineHeight, '22px', 'ghost renders on a pristine composer', 'line height')
  equal(ghost.props.style.whiteSpace, 'pre-wrap', 'ghost renders on a pristine composer', 'wrapping')
  equal(ghost.props.style.textOverflow, undefined, 'ghost renders on a pristine composer', 'no ellipsis')
  equal(placeholderNode.style.visibility, 'hidden', 'ghost renders on a pristine composer', 'placeholder hidden')
  const hint = findAll(ghost, node => node.props.role === 'button')[0]
  ok(hint, 'ghost renders on a pristine composer', 'first-time hint pill missing')
}

// 3. Clicking the hint accepts through setDraft
// ---------------------------------------------------------------------------

async function group03() {
  const ghost = ghostOf(suggestionRoot.tree)
  const hint = findAll(ghost, node => node.props.role === 'button')[0]
  hint.props.onMouseDown({ preventDefault() {} })
  await suggestionRoot.refresh()
  equal(calls.setDraft[calls.setDraft.length - 1]?.sessionId, 'session-test', 'hint accepts via setDraft', 'session id')
  equal(calls.setDraft[calls.setDraft.length - 1]?.text, 'HELLO_PREDICTION', 'hint accepts via setDraft', 'draft text')
  equal(fakeWindow.localStorage.getItem('dsh.next-suggestion.accepted'), '1', 'hint accepts via setDraft', 'accepted flag stored')
}

// 4. After one acceptance the hint never returns
// ---------------------------------------------------------------------------

async function group04() {
  suggestionRoot.unmount()
  inputState.draft = ''
  storage.delete('dsh.next-suggestion.accepted')
  // simulate an earlier acceptance
  fakeWindow.localStorage.setItem('dsh.next-suggestion.accepted', '1')
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  const ghost = ghostOf(suggestionRoot.tree)
  ok(ghost, 'hint never returns after acceptance', 'ghost should still render')
  const hint = findAll(ghost, node => node.props.role === 'button')[0]
  equal(hint, undefined, 'hint never returns after acceptance', 'hint should be gone')
}

// 5. A tall composer is clamped to its first line
// ---------------------------------------------------------------------------

async function group05() {
  suggestionRoot.unmount()
  inputState.draft = ''
  composerNode.rect = { left: 40, top: 100, width: 320, height: 96, right: 360, bottom: 196 }
  placeholderNode.rect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  const ghost = ghostOf(suggestionRoot.tree)
  ok(ghost, 'tall composer is clamped', 'ghost missing')
  equal(ghost.props.style.top, '112px', 'tall composer is clamped', 'clamped top should include padding')
  equal(ghost.props.style.lineHeight, '22px', 'tall composer is clamped', 'clamped line height')
  composerNode.rect = { left: 40, top: 100, width: 320, height: 26, right: 360, bottom: 126 }
  placeholderNode.rect = { left: 52, top: 101, width: 200, height: 22, right: 252, bottom: 123 }
}

// 6. Keyboard interactions
// ---------------------------------------------------------------------------

async function group06() {
  suggestionRoot.unmount()
  inputState.draft = ''
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()

  const tab = press('Tab')
  equal(tab.defaultPrevented, true, 'keyboard accepts on Tab', 'Tab should be claimed on an empty composer')
  equal(calls.setDraft[calls.setDraft.length - 1]?.text, 'HELLO_PREDICTION', 'keyboard accepts on Tab', 'Tab should insert')

  // draft now holds the prediction; the ghost hides; clearing the draft
  // brings the same prediction back (insert never writes "dismissed")
  inputState.draft = ''
  await suggestionRoot.refresh()
  ok(ghostOf(suggestionRoot.tree), 'clearing the draft restores the ghost', 'ghost should return')

  // plain inputs and modifier chords are never hijacked (empty composer,
  // listener attached)
  const inputTarget = press('Tab', { tagName: 'INPUT', value: '' })
  equal(inputTarget.defaultPrevented, false, 'keyboard ignores plain inputs', 'INPUT is never hijacked')
  const arrowInput = press('ArrowRight', { tagName: 'INPUT', value: '' })
  equal(arrowInput.defaultPrevented, false, 'keyboard ignores plain inputs', 'INPUT ignores ArrowRight too')
  const shifted = press('Tab', composerNode, { shiftKey: true })
  equal(shifted.defaultPrevented, false, 'modifiers pass through', 'Shift+Tab is not claimed')
  const meta = press('Tab', composerNode, { metaKey: true })
  equal(meta.defaultPrevented, false, 'modifiers pass through', 'Meta+Tab is not claimed')

  const arrow = press('ArrowRight')
  equal(arrow.defaultPrevented, true, 'ArrowRight accepts', 'ArrowRight should be claimed on an empty composer')
  equal(calls.setDraft[calls.setDraft.length - 1]?.text, 'HELLO_PREDICTION', 'ArrowRight accepts', 'ArrowRight should insert')

  // with a draft present the composer keeps its Tab (focus traversal)
  inputState.draft = '有草稿'
  await suggestionRoot.refresh()
  const busy = press('Tab')
  equal(busy.defaultPrevented, false, 'keyboard ignores a busy composer', 'Tab should not be claimed with a draft')
  inputState.draft = ''
}

// 7. Escape dismisses only the matching prediction
// ---------------------------------------------------------------------------

async function group07() {
  suggestionRoot.unmount()
  inputState.draft = ''
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  ok(ghostOf(suggestionRoot.tree), 'escape dismisses the current prediction', 'ghost should be visible first')

  const escaped = press('Escape')
  equal(escaped.defaultPrevented, true, 'escape dismisses the current prediction', 'Escape should be claimed')
  await suggestionRoot.refresh()
  equal(ghostOf(suggestionRoot.tree), null, 'escape dismisses the current prediction', 'ghost should be gone')
  ok(placeholderNode.style.visibility !== 'hidden', 'escape dismisses the current prediction', 'placeholder restored')

  predictionText = 'SECOND_PREDICTION'
  docListeners.get('visibilitychange')()
  await suggestionRoot.refresh()
  const ghost = ghostOf(suggestionRoot.tree)
  ok(ghost, 'a new prediction is not dismissed', 'new prediction should be visible')
  equal(textOf(ghost).includes('SECOND_PREDICTION'), true, 'a new prediction is not dismissed', 'new text expected')
  predictionText = 'HELLO_PREDICTION'
}

// 8. A non-empty draft neither renders nor requests
// ---------------------------------------------------------------------------

async function group08() {
  suggestionRoot.unmount()
  inputState.draft = '用户正在打字'
  const before = predictCalls().length
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  equal(ghostOf(suggestionRoot.tree), null, 'no ghost while drafting', 'ghost must not render')
  equal(predictCalls().length, before, 'no ghost while drafting', 'no request should be sent')
  inputState.draft = ''
}

// 9. The turn edge, not a timer, triggers prediction
// ---------------------------------------------------------------------------

async function group09() {
  suggestionRoot.unmount()
  const sessionSnapshot = { running: true }
  suggestionRoot = mountSuggestion({ useSession: selector => selector(sessionSnapshot) })
  await suggestionRoot.mount()
  const before = predictCalls().length
  equal(ghostOf(suggestionRoot.tree), null, 'turn edge triggers prediction', 'no ghost while the turn runs')

  sessionSnapshot.running = false
  await suggestionRoot.refresh()
  equal(predictCalls().length - before, 1, 'turn edge triggers prediction', 'exactly one request on the edge')
  const bodies = predictBodies()
  equal(bodies[bodies.length - 1].body.force, true, 'turn edge triggers prediction', 'edge request must be forced')

  await suggestionRoot.refresh()
  await sleep(60)
  equal(predictCalls().length - before, 1, 'turn edge triggers prediction', 'no timer-driven requests')

  ok(suggestionRoot.intervals.every(delay => delay === 250), 'turn edge triggers prediction', `only reposition timers expected, saw ${suggestionRoot.intervals.join(',')}`)
  suggestionRoot.unmount()
}

// 10. Hidden windows stay quiet until visibility returns
// ---------------------------------------------------------------------------

async function group10() {
  inputState.draft = ''
  fakeDocument.visibilityState = 'hidden'
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  const before = predictCalls().length
  equal(ghostOf(suggestionRoot.tree), null, 'hidden window stays quiet', 'no ghost while hidden')
  equal(predictCalls().length, before, 'hidden window stays quiet', 'no request while hidden')

  fakeDocument.visibilityState = 'visible'
  docListeners.get('visibilitychange')()
  await suggestionRoot.refresh()
  equal(predictCalls().length - before, 1, 'visibilitychange wakes prediction', 'exactly one request on wake')
  suggestionRoot.unmount()
}

// 11. Long predictions wrap instead of truncating
// ---------------------------------------------------------------------------

async function group11() {
  const long = '这是一条很长的预测'.repeat(40)
  predictionText = long
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  const ghost = ghostOf(suggestionRoot.tree)
  ok(ghost, 'long predictions wrap', 'ghost missing')
  equal(ghost.props.style.whiteSpace, 'pre-wrap', 'long predictions wrap', 'wrapping style')
  ok(/^\d+(\.\d+)?px$/.test(ghost.props.style.width), 'long predictions wrap', 'width should be a pixel value')
  equal(textOf(ghost).includes(long), true, 'long predictions wrap', 'full text must stay in the tree')
  predictionText = 'HELLO_PREDICTION'
  suggestionRoot.unmount()
}

// 12. Hosts without a session snapshot poll at the Host-configured interval
// ---------------------------------------------------------------------------

async function group12() {
  inputState.draft = ''
  suggestionRoot = mountSuggestion()
  await suggestionRoot.mount()
  ok(suggestionRoot.intervals.includes(45000), 'fallback poll honours Host config', `expected 45000 in [${suggestionRoot.intervals.join(',')}]`)
  suggestionRoot.unmount()
}

// 13. The settings row toggles the feature off
// ---------------------------------------------------------------------------

async function group13() {
  const settingsRoot = createRoot(registered.get('settings.general.item').component, {})
  activeRoot = settingsRoot
  await settingsRoot.mount()
  const toggle = findAll(settingsRoot.tree, node => node.props.role === 'switch')[0]
  ok(toggle, 'settings row renders a switch', 'toggle missing')
  toggle.props.onClick()
  equal(fakeWindow.localStorage.getItem('dsh.next-suggestion.enabled'), '0', 'settings row renders a switch', 'disabled flag stored')
  settingsRoot.unmount()
  fakeWindow.localStorage.setItem('dsh.next-suggestion.enabled', '1')
}

// 14. The plugin config form
// ---------------------------------------------------------------------------

async function group14() {
  fakeWindow.localStorage.setItem('dsh.next-suggestion.enabled', '1')
  const configRoot = createRoot(registered.get('dsh-next-suggestion#next-suggestion').component, {})
  activeRoot = configRoot
  await configRoot.mount()
  const section = findAll(configRoot.tree, node => node.props['data-dsh-next-suggestion-config'] !== undefined)[0]
  ok(section, 'config form renders', 'section missing')
  ok(textOf(configRoot.tree).includes('预测消息设置'), 'config form renders', 'title missing')

  const labels = findAll(configRoot.tree, node => node.type === 'label')
  equal(labels.length, 4, 'config form renders', 'four fields expected')

  const inputs = findAll(configRoot.tree, node => node.type === 'input' && node.props.type === 'number')
  equal(String(inputs[0].props.defaultValue), '1800000', 'config form renders', 'cacheTtl default value')

  const postsBefore = configPosts().length
  await inputs[0].props.onBlur({ target: { value: '900000' } })
  await configRoot.refresh()
  equal(configPosts().length - postsBefore, 1, 'config form saves valid edits', 'exactly one POST expected')
  equal(configPosts()[configPosts().length - 1].body.field, 'cacheTtlMs', 'config form saves valid edits', 'field name')
  equal(configPosts()[configPosts().length - 1].body.value, 900000, 'config form saves valid edits', 'numeric value')
  ok(textOf(configRoot.tree).includes('已保存'), 'config form saves valid edits', 'saved note missing')

  const select = findAll(configRoot.tree, node => node.type === 'select')[0]
  await select.props.onChange({ target: { value: 'medium' } })
  await configRoot.refresh()
  equal(configPosts()[configPosts().length - 1].body.field, 'preferredReasoningEffort', 'config form saves choices', 'field name')
  equal(configPosts()[configPosts().length - 1].body.value, 'medium', 'config form saves choices', 'choice value')

  const postsBeforeInvalid = configPosts().length
  const cacheTtlInput = findAll(configRoot.tree, node => node.type === 'input' && node.props.type === 'number')[0]
  await cacheTtlInput.props.onBlur({ target: { value: '0' } })
  await configRoot.refresh()
  equal(configPosts().length, postsBeforeInvalid, 'config form blocks invalid edits', 'no POST expected')
  ok(textOf(configRoot.tree).includes('数值超出范围'), 'config form blocks invalid edits', 'invalid note missing')
  configRoot.unmount()
}

// ---------------------------------------------------------------------------

async function regressions() {
  storage.clear()
  inputState.draft = ''
  const snapshot = { running: false }
  let root = mountSuggestion({ useSession: selector => selector(snapshot) })
  await root.mount()
  equal(press('Tab', { ...composerNode }).defaultPrevented, false, 'foreign editor keeps its keyboard')
  equal(press('Enter', composerNode, { keyCode: 229 }).defaultPrevented, false, 'IME Enter is never accepted')
  windowListeners.get('compositionstart:1')({ target: composerNode })
  await root.refresh()
  equal(ghostOf(root.tree), null, 'IME composition hides ghost')
  windowListeners.get('compositionend:1')()
  await root.refresh()
  ok(ghostOf(root.tree), 'composition end restores ghost')
  equal(press('Enter').defaultPrevented, true, 'Enter accepts without submitting')
  inputState.draft = ''
  await root.refresh()

  inputState.phase = 'submitting'
  await root.refresh()
  equal(ghostOf(root.tree), null, 'submission hides ghost')
  inputState.phase = 'plain'
  inputState.attachmentIds = ['file-1']
  const beforeAttachments = predictCalls().length
  await root.refresh()
  equal(ghostOf(root.tree), null, 'attachments make the composer nonempty')
  equal(predictCalls().length, beforeAttachments, 'attachments do not trigger prediction')
  inputState.attachmentIds = []
  inputState.draft = ' '
  await root.refresh()
  equal(ghostOf(root.tree), null, 'whitespace is still a draft')
  inputState.draft = ''
  await root.refresh()

  fakeDocument.hasFocus = () => false
  windowListeners.get('blur:0')()
  await root.refresh()
  equal(ghostOf(root.tree), null, 'blur hides an existing ghost')
  fakeDocument.hasFocus = () => true
  windowListeners.get('focus:0')()
  await root.refresh()
  equal(predictBodies().at(-1).body.force, undefined, 'focus catch-up respects cache')

  // A turn starting while the user has a draft must invalidate the old text.
  inputState.draft = 'working draft'
  snapshot.running = true
  await root.refresh()
  snapshot.running = false
  await root.refresh()
  predictionResponse = async () => ({ ok: false, status: 503 })
  inputState.draft = ''
  await root.refresh()
  equal(ghostOf(root.tree), null, 'failed new turn cannot resurrect an old prediction')
  predictionResponse = null
  root.unmount()

  // Switching sessions hides old text before the next response arrives.
  root = mountSuggestion({ useSession: selector => selector(snapshot) })
  await root.mount()
  let resolveResponse
  predictionResponse = () => new Promise(resolve => { resolveResponse = resolve })
  root.props.sessionId = 'session-other'
  await root.refresh()
  equal(ghostOf(root.tree), null, 'session switch hides old prediction immediately')
  resolveResponse({ ok: true, json: async () => ({ text: 'OTHER_SESSION' }) })
  await root.refresh()
  ok(textOf(root.tree).includes('OTHER_SESSION'), 'new session displays its own prediction')
  root.unmount()
  predictionResponse = null

  // Fetch cancellation can race with delivery: an aborted response never wins.
  const pending = []
  predictionResponse = () => new Promise(resolve => pending.push(resolve))
  root = mountSuggestion({ useSession: selector => selector(snapshot) })
  await root.mount()
  snapshot.running = true
  await root.refresh()
  snapshot.running = false
  await root.refresh()
  pending[1]({ ok: true, json: async () => ({ text: 'LATEST_TURN' }) })
  await root.refresh()
  pending[0]({ ok: true, json: async () => ({ text: 'STALE_TURN' }) })
  await root.refresh()
  ok(textOf(root.tree).includes('LATEST_TURN'), 'stale response cannot overwrite latest turn')
  root.unmount()
  predictionResponse = null
}

async function main() {
  clientModule.apply(fakeHostCtx)

  group01()
  await group02()
  await group03()
  await group04()
  await group05()
  await group06()
  await group07()
  await group08()
  await group09()
  await group10()
  await group11()
  await group12()
  await group13()
  await group14()
  await regressions()

  if (failures === 0) {
    console.log('client-half harness: OK')
  } else {
    console.log('client-half harness: FAILED')
    process.exitCode = 1
  }
  console.log(`requests: ${fetchCalls.length}`)
}

await main()
