import { languageOf, normalize, type Preferences } from './config.ts'
import { vocabulary, WordBag } from './words.ts'

export const RUNNING = '[data-chat-running]'
const ACTIVE = RUNNING
const OWN = '[data-rich-thinking-host]'
const HIDDEN = '[hidden], [data-turn-process-hidden="true"], [data-turn-process-inline="true"]'

export interface LabelView {
  readonly id: number
  readonly host: HTMLElement
  readonly word: string
  readonly suffix: string
  readonly language: 'en' | 'zh'
  readonly motion: boolean
}
interface Seat {
  row: HTMLElement
  scope: HTMLElement
  header: HTMLElement
  title: HTMLElement
  host: HTMLElement
  nextWordAt: number
  bag: WordBag
  word: string
  id: number
}
export interface Clock {
  now(): number
  start(callback: () => void, ms: number): ReturnType<typeof setInterval>
  stop(id: ReturnType<typeof setInterval>): void
}
const clock: Clock = {
  now: () => performance.now(), start: (fn, ms) => setInterval(fn, ms), stop: id => clearInterval(id),
}

/** Version-scoped adapter for an upstream component with no header Slot.
 * Does not mutate React-owned text, replace a node renderer, or touch reasoning bodies.
 * A single observer mirrors native status text; a single clock only rotates words.
 */
export class RunningStatusAdapter {
  private readonly seats = new Map<HTMLElement, Seat>()
  private readonly listeners = new Set<() => void>()
  private snapshot: readonly LabelView[] = []
  private config: Preferences
  private nextId = 0
  private observer: MutationObserver | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private timerDelay: number | undefined
  private media: MediaQueryList | undefined
  private disposed = false

  constructor(private readonly doc: Document, config: Preferences,
    private readonly time: Clock = clock, private readonly random = Math.random) {
    this.config = normalize(config)
  }

  getSnapshot = (): readonly LabelView[] => this.snapshot
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  start(): void {
    if (this.disposed || this.observer) return
    const win = this.doc.defaultView
    if (!win) return
    this.media = win.matchMedia?.('(prefers-reduced-motion: reduce)')
    this.media?.addEventListener('change', this.motionChanged)
    this.doc.addEventListener('visibilitychange', this.visibilityChanged)
    this.observer = new win.MutationObserver(records => this.mutations(records))
    this.observer.observe(this.doc.body, {
      subtree: true, childList: true, attributes: true, characterData: true,
      attributeFilter: ['data-chat-running', 'data-turn-process-hidden', 'data-turn-process-inline', 'hidden', 'data-shimmer'],
      // Only native status-label changes are consumed; transcript tokens are ignored.
    })
    this.scan(this.doc.body)
    this.sync()
  }

  update(config: Preferences): void {
    if (this.disposed) return
    const next = normalize(config)
    if (JSON.stringify(next) === JSON.stringify(this.config)) return
    this.config = next
    for (const seat of this.seats.values()) {
      seat.bag = this.makeBag()
      seat.word = seat.bag.next()
      seat.nextWordAt = this.time.now() + next.intervalMs
    }
    this.scan(this.doc.body)
    this.sync()
  }

  private makeBag(): WordBag { return new WordBag(vocabulary(this.config, languageOf(this.config)), this.random) }
  private motion = (): boolean => this.config.animation && !this.media?.matches
  private motionChanged = (): void => { this.sync() }
  private visibilityChanged = (): void => {
    // Resume with a fresh visible interval; never replay hidden-tab ticks in a burst.
    for (const seat of this.seats.values()) seat.nextWordAt = this.time.now() + this.config.intervalMs
    this.scan(this.doc.body)
    this.sync()
  }

  private live(row: HTMLElement): boolean {
    return this.config.enabled && !this.doc.hidden && row.isConnected
      && row.matches(ACTIVE) && this.location(row) !== undefined
  }

  private location(row: HTMLElement): { scope: HTMLElement; header: HTMLElement } | undefined {
    if (row.closest(HIDDEN)) return
    // RunningStatus -> runningContent -> TextShimmer. The whale is its sibling.
    const header = row.querySelector<HTMLElement>(':scope > span > [data-shimmer="true"]')
    if (!header || !row.querySelector(':scope > [role="status"]')) return
    return { scope: row, header }
  }

  private suffix(row: HTMLElement, title: HTMLElement): string | undefined {
    const prefix = row.querySelector(':scope > [role="status"]')?.textContent
    const text = title.textContent ?? ''
    // Use the native localized prefix; preserve the native duration and punctuation verbatim.
    return prefix && text.startsWith(prefix) ? text.slice(prefix.length) : undefined
  }

  private attach(row: HTMLElement): void {
    if (this.seats.has(row) || !this.live(row) || row.hasAttribute('data-rich-thinking')) return
    // Verified against RunningStatus -> TextShimmer, rc.2 and alpha.2.
    // Refuse other renderers/versions instead of guessing class hashes or label text.
    const { scope, header } = this.location(row)!
    if (scope.hasAttribute('data-rich-thinking')) return
    const shimmer = header
    const content = shimmer.firstElementChild
    const title = content?.firstElementChild
    if (!(title instanceof this.doc.defaultView!.HTMLElement)
      || title.tagName !== 'SPAN' || !shimmer?.hasAttribute('data-shimmer')
      || !title.textContent?.trim() || title.querySelector('*') || title.hasAttribute('data-rich-thinking-title')
      || this.suffix(row, title) === undefined) return
    const host = this.doc.createElement('span')
    host.setAttribute('data-rich-thinking-host', '')
    // Keep the React-owned label intact; RunningStatus retains its separate accessible status.
    // The changing decorative copy must not announce every word or second to screen readers.
    host.setAttribute('aria-hidden', 'true')
    title.setAttribute('data-rich-thinking-title', '')
    scope.setAttribute('data-rich-thinking', '')
    // Replace the entire visual text subtree. TextShimmer can render additional
    // native copies; placing our host inside it leaves those copies competing.
    header.setAttribute('data-rich-thinking-native', '')
    header.parentElement!.insertBefore(host, header)
    const bag = this.makeBag()
    const now = this.time.now()
    this.seats.set(row, { row, scope, header, title, host,
      nextWordAt: now + this.config.intervalMs, bag, word: bag.next(), id: ++this.nextId })
  }

  private detach(seat: Seat): void {
    seat.host.remove()
    seat.title.removeAttribute('data-rich-thinking-title')
    seat.header.removeAttribute('data-rich-thinking-native')
    seat.scope.removeAttribute('data-rich-thinking')
    seat.scope.removeAttribute('data-rich-thinking-motion')
    this.seats.delete(seat.row)
  }

  private scan(root: Element): void {
    if (!this.config.enabled || this.doc.hidden || root.closest(OWN)) return
    if (root.matches(ACTIVE)) this.attach(root as HTMLElement)
    for (const row of root.querySelectorAll<HTMLElement>(ACTIVE)) this.attach(row)
  }

  private mutations(records: MutationRecord[]): void {
    if (this.disposed) return
    let relevant = false
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement
      if (target?.closest(OWN) || target?.closest('[data-slot="conversation.chat.reasoning.body"]')) continue
      if (target?.closest(RUNNING)) relevant = true
      if (record.type === 'characterData') continue
      if (record.type === 'attributes') {
        if (target) this.scan(target.closest(RUNNING) ?? target)
        relevant = true
      } else {
        // Status text changes publish above; transcript text does not drive updates.
        for (const added of record.addedNodes) {
          if (added.nodeType !== 1) continue
          const element = added as Element
          if (element.matches(OWN) || element.closest(OWN)) continue
          this.scan(element.closest(RUNNING) ?? element)
          // Header structure can change after an upstream remount.
          if (element.matches(ACTIVE) || element.querySelector(ACTIVE)) relevant = true
        }
        // O(active rows), not O(history), when elements are removed.
        if (this.seats.size && [...record.removedNodes].some(node => node.nodeType === 1
          && [...this.seats.values()].some(seat => node.contains(seat.row) || node.contains(seat.host) || node.contains(seat.title)))) relevant = true
      }
    }
    if (relevant) this.sync()
  }

  private sync(): void {
    const relocate: HTMLElement[] = []
    for (const seat of this.seats.values()) {
      if (!this.live(seat.row) || !seat.host.isConnected || seat.host.parentElement !== seat.header.parentElement
        || !seat.title.isConnected || !seat.header.contains(seat.title)
        || this.location(seat.row)?.header !== seat.header || this.suffix(seat.row, seat.title) === undefined) {
        relocate.push(seat.row)
        this.detach(seat)
      }
    }
    for (const row of relocate) this.attach(row)
    for (const seat of this.seats.values()) seat.scope.setAttribute('data-rich-thinking-motion', this.motion() ? 'on' : 'off')
    // One timer total, only while at least one native running status is visible.
    const delay = this.seats.size && vocabulary(this.config, languageOf(this.config)).length > 1
      ? this.config.intervalMs : undefined
    if (this.timerDelay !== delay) {
      this.stopClock()
      if (delay !== undefined) {
        this.timerDelay = delay
        this.timer = this.time.start(this.tick, delay)
      }
    }
    this.publish()
  }

  private tick = (): void => {
    const now = this.time.now()
    for (const seat of this.seats.values()) {
      if (!this.live(seat.row)) { this.sync(); return }
      if (now >= seat.nextWordAt) {
        seat.word = seat.bag.next()
        seat.nextWordAt = now + this.config.intervalMs
      }
    }
    this.publish()
  }

  private publish(): void {
    const next = [...this.seats.values()].map(seat => ({ id: seat.id, host: seat.host,
      word: seat.word, suffix: this.suffix(seat.row, seat.title) ?? '',
      language: languageOf(this.config), motion: this.motion() }))
    if (next.length === this.snapshot.length && next.every((item, index) => {
      const old = this.snapshot[index]!
      return item.id === old.id && item.word === old.word && item.suffix === old.suffix
        && item.language === old.language && item.motion === old.motion
    })) return
    this.snapshot = next
    for (const notify of this.listeners) notify()
  }

  private stopClock(): void {
    if (this.timer !== undefined) this.time.stop(this.timer)
    this.timer = undefined
    this.timerDelay = undefined
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.observer?.disconnect()
    this.stopClock()
    this.doc.removeEventListener('visibilitychange', this.visibilityChanged)
    this.media?.removeEventListener('change', this.motionChanged)
    for (const seat of this.seats.values()) this.detach(seat)
    this.publish()
    this.listeners.clear()
  }
}
