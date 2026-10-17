import React from 'react'
import { installActions, preferences } from './actions.ts'
import type { ClientContext } from './contracts.ts'
import { Settings } from './settings.tsx'
import { css } from './style.ts'

export const inject = ['slots', 'shortcuts', 'configForms', 'sessions', 'workspaces', 'conversation', 'uiConversation', 'uiWorkspace', 'layout']
export function apply(ctx: ClientContext): void {
  const form = ctx.configForms.get('dshkey')
  ctx.effect(() => installActions(ctx, () => {
    const state = form.getSnapshot()
    return state.status === 'ready' ? preferences(state.value) : { ...preferences(), enabled: false }
  }, navigator.clipboard))
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.dshkey = ''; style.textContent = css
    document.head.append(style)
    return () => style.remove()
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'dshkey', order: 25, label: '快捷键 · DSHKey' },
    () => <Settings form={form} shortcuts={ctx.shortcuts} />))
}
