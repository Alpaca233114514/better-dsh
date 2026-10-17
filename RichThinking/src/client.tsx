import React, { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { RunningStatusAdapter, type LabelView } from './adapter.ts'
import { normalize, type Preferences } from './config.ts'
import type { ClientContext } from './contracts.ts'
import { css } from './style.ts'
import { Settings } from './settings.tsx'

export const inject = ['slots', 'configForms']

const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const splitWord = (word: string) => Array.from(characters.segment(word), part => part.segment)

const RotatingWord = memo(function RotatingWord({ word, motion }: { word: string; motion: boolean }) {
  const [visible, setVisible] = useState(word)
  const current = useRef(word)
  useEffect(() => {
    if (!motion || current.current === word) {
      current.current = word
      setVisible(word)
      return
    }
    const before = splitWord(current.current), after = splitWord(word)
    const length = Math.max(before.length, after.length)
    // Replace from left to right, keeping the untouched right-hand characters in place.
    // Short Chinese phrases take ~160ms; even long custom phrases finish within 280ms.
    const duration = Math.min(280, length * 32)
    const started = performance.now()
    let frame: number
    const advance = (now: number) => {
      const count = Math.min(length, Math.max(0, Math.floor((now - started) / duration * length)))
      current.current = after.slice(0, count).join('') + before.slice(count).join('')
      setVisible(current.current)
      if (count < length) frame = window.requestAnimationFrame(advance)
    }
    frame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(frame)
  }, [word, motion])
  return <>{motion ? visible : word}</>
})

const Label = memo(function Label({ word, suffix, language, motion }: Omit<LabelView, 'id' | 'host'>) {
  return <span data-rich-thinking-label="" data-motion={motion ? 'on' : 'off'} lang={language}>
    <span data-rich-thinking-word="" title={word}><RotatingWord word={word} motion={motion} />{suffix ? '' : '…'}</span>
    {suffix && <span data-rich-thinking-elapsed="">{suffix}</span>}
  </span>
})

export function apply(ctx: ClientContext): void {
  const form = ctx.configForms.get<Preferences>('rich-thinking')
  // Do not flash an enabled UI while persisted preferences are still loading.
  const preferences = (): Preferences => form.getSnapshot().status === 'ready'
    ? normalize(form.getSnapshot().value) : normalize({ enabled: false })
  const adapter = new RunningStatusAdapter(document, preferences())
  function Controller() {
    const labels = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot)
    return <>{labels.map(({ id, host, ...view }) => createPortal(<Label {...view} />, host, String(id)))}</>
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-rich-thinking-style', '')
    style.textContent = css
    document.head.append(style)
    const refresh = () => adapter.update(preferences())
    const offConfig = form.subscribe(refresh)
    adapter.start()
    return () => { offConfig(); adapter.dispose(); style.remove() }
  })
  // Official additive Slot: no overlay UI, no existing renderer is replaced.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'rich-thinking' }, Controller))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-rich-thinking' }, () => <Settings form={form} />))
}
