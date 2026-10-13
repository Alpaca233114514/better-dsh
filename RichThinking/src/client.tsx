import React, { memo, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ReasoningAdapter, type LabelView } from './adapter.ts'
import { normalize, type Preferences } from './config.ts'
import type { ClientContext } from './contracts.ts'
import { css } from './style.ts'
import { Settings } from './settings.tsx'

export const inject = ['slots', 'configForms']

const Label = memo(function Label({ word, elapsed, language, motion }: Omit<LabelView, 'id' | 'host'>) {
  return <span data-rich-thinking-label="" data-motion={motion ? 'on' : 'off'} lang={language}>
    <span key={word} data-rich-thinking-word="" title={word}>{word}…</span>
    {elapsed !== null && <span data-rich-thinking-elapsed="" title={language === 'zh'
      ? '此推理行在当前页面可见期间的计时；不是模型报告的推理时长'
      : 'Time this live reasoning row has been visible here; not model-reported reasoning time'}>{elapsed}s</span>}
  </span>
})

export function apply(ctx: ClientContext): void {
  const form = ctx.configForms.get<Preferences>('rich-thinking')
  // Do not flash an enabled UI while persisted preferences are still loading.
  const preferences = (): Preferences => form.getSnapshot().status === 'ready'
    ? normalize(form.getSnapshot().value) : normalize({ enabled: false })
  const adapter = new ReasoningAdapter(document, preferences())
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
