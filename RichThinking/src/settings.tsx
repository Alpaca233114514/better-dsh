import React, { useCallback, useId, useState, useSyncExternalStore } from 'react'
import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { cleanWords, normalize, type Preferences } from './config.ts'
import type { ConfigForm } from './contracts.ts'

interface Draft {
  values: Preferences
  chinese: string
  english: string
  seconds: string
  revision: number | undefined
}

export function Settings({ form }: { form: ConfigForm<Preferences> }) {
  const subscribe = useCallback((fn: () => void) => form.subscribe(fn), [form])
  const snapshot = useCallback(() => form.getSnapshot(), [form])
  const state = useSyncExternalStore(subscribe, snapshot, snapshot)
  const [draft, setDraft] = useState<Draft>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const id = useId()
  const accepted = normalize(state.value)
  const current = draft ?? { values: accepted, chinese: accepted.chineseVerbs.join('\n'),
    english: accepted.englishVerbs.join('\n'), seconds: String(accepted.intervalMs / 1000), revision: state.revision }
  const disabled = state.status !== 'ready' || !state.writable || saving
  function edit(change: Partial<Draft>) { setDraft({ ...current, ...change }); setMessage('') }
  function value<K extends keyof Preferences>(field: K, next: Preferences[K]) {
    edit({ values: { ...current.values, [field]: next } })
  }
  async function save() {
    const seconds = Number(current.seconds)
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 60) {
      setMessage('切换间隔请输入 2–60 秒。'); return
    }
    const next = normalize({ ...current.values, intervalMs: seconds * 1000,
      chineseVerbs: cleanWords(current.chinese.split('\n')), englishVerbs: cleanWords(current.english.split('\n')) })
    setSaving(true); setMessage('')
    try {
      const ok = await form.mutate(Object.entries(next).map(([field, val]) => ({ op: 'set', path: [field], value: val })), current.revision)
      if (ok) { setDraft(undefined); setMessage('已保存，立即生效。') }
      else setMessage('未保存。配置可能已在别处修改，请重新载入后再试。')
    } catch { setMessage('保存失败，请检查 DSH 连接后重试。') }
    finally { setSaving(false) }
  }
  return <form data-rich-thinking-settings="" onSubmit={event => { event.preventDefault(); if (!disabled && draft) void save() }}>
    {(['enabled', 'animation', 'showElapsed'] as const).map((field, index) => {
      const label = ['启用 Rich Thinking', '文字过渡动画', '显示运行耗时'][index]!
      return <div key={field} data-rt-setting-field=""><div data-rt-setting-row=""><span>{label}</span>
        <Switch label={label} checked={current.values[field]} disabled={disabled} onChange={next => value(field, next)} /></div>
      </div>
    })}
    <div data-rt-setting-field="">
      <label htmlFor={`${id}-language`}>轮播语言</label>
      <select id={`${id}-language`} value={current.values.language} disabled={disabled}
        onChange={event => value('language', event.target.value as 'zh' | 'en')}>
        <option value="zh">中文</option><option value="en">English</option>
      </select>
    </div>
    <div data-rt-setting-field="">
      <label htmlFor={`${id}-mode`}>自定义词库</label>
      <select id={`${id}-mode`} value={current.values.vocabularyMode} disabled={disabled}
        onChange={event => value('vocabularyMode', event.target.value as 'append' | 'replace')}>
        <option value="append">追加到默认词库</option><option value="replace">替换默认词库</option>
      </select>
    </div>
    <div data-rt-setting-field="">
      <label htmlFor={`${id}-chinese`}>中文词库（每行一条）</label>
      <textarea id={`${id}-chinese`} rows={4} value={current.chinese} disabled={disabled}
        placeholder={'叽里呱啦中\n琢磨中\n想法冒泡中'} onChange={event => edit({ chinese: event.target.value })} />
    </div>
    <div data-rt-setting-field="">
      <label htmlFor={`${id}-english`}>English vocabulary（每行一条）</label>
      <textarea id={`${id}-english`} rows={4} value={current.english} disabled={disabled}
        placeholder={'Pondering\nConnecting the dots\nUntangling'} onChange={event => edit({ english: event.target.value })} />
    </div>
    <div data-rt-setting-field="">
      <label htmlFor={`${id}-interval`}>切换间隔（秒）</label>
      <Input id={`${id}-interval`} type="number" min={2} max={60} step={0.1} value={current.seconds}
        disabled={disabled} onChange={event => edit({ seconds: event.target.value })} />
    </div>
    <div data-rt-setting-actions="">
      <Button type="submit" variant="primary" disabled={disabled || !draft}>{saving ? '保存中…' : '保存设置'}</Button>
      <Button disabled={saving || !draft} onClick={() => { setDraft(undefined); setMessage('') }}>重新载入</Button>
    </div>
    {state.status !== 'ready' && <p role="status">{state.status === 'loading' ? '正在载入设置…' : '当前连接无法读取设置。'}</p>}
    {state.status === 'ready' && !state.writable && <p role="status">当前设置为只读。</p>}
    {message && <p role="status">{message}</p>}
  </form>
}
