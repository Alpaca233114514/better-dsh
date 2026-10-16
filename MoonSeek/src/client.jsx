import React, { useSyncExternalStore } from 'react'
import css from './style.css'

export const inject = ['slots', 'theme', 'locale']

const copy = {
  zh: { title: '外观', light: '月之亮面', dark: '月之暗面', system: '跟随系统' },
  en: { title: 'Appearance', light: 'Moonlit Side', dark: 'Dark Side of the Moon', system: 'Follow System' },
}
const modes = ['light', 'dark', 'system']

// Original glyphs share a 24px box, currentColor and a 1.5px stroke.
export function MoonIcon({ mode }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    {mode === 'light' ? <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9" cy="9" r="1.25" />
      <circle cx="14.5" cy="14" r="2" />
      <path d="M7.5 14.5h.01M15 8h.01" />
    </> : mode === 'dark' ? <>
      <path d="M20.2 14.1A8.5 8.5 0 0 1 9.9 3.8a8.5 8.5 0 1 0 10.3 10.3Z" />
      <path d="M7.5 14.5h.01" />
    </> : <>
      <rect x="3" y="4.5" width="18" height="13" rx="1.5" />
      <path d="M9 21h6M12 17.5V21" />
    </>}
  </svg>
}

export function AppearanceRow({ preference, language, setTheme }) {
  const labels = copy[/^zh(?:-|$)/i.test(language) ? 'zh' : 'en']
  return <div className="moonseek-appearance" data-moonseek-appearance="">
    <div className="moonseek-title">{labels.title}</div>
    <div className="moonseek-cubes" role="group" aria-label={labels.title}>
      {modes.map(mode => <button key={mode} type="button" className="moonseek-cube"
        data-moonseek-mode={mode} aria-pressed={preference === mode}
        onClick={() => setTheme(mode)}>
        <MoonIcon mode={mode} />
        <span>{labels[mode]}</span>
      </button>)}
    </div>
  </div>
}

export function apply(ctx) {
  const subscribeTheme = listener => ctx.on('theme/change', listener)
  const getPreference = () => ctx.theme.getTheme().preference
  const subscribeLocale = listener => ctx.locale.subscribe(listener)
  const getLanguage = () => ctx.locale.getSnapshot().active
  const setTheme = mode => ctx.theme.setTheme(mode)
  function ConnectedAppearance() {
    const preference = useSyncExternalStore(subscribeTheme, getPreference, getPreference)
    const language = useSyncExternalStore(subscribeLocale, getLanguage, getLanguage)
    return <AppearanceRow preference={preference} language={language} setTheme={setTheme} />
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.moonseekStyle = ''
    style.textContent = css
    document.head.append(style)
    return () => style.remove()
  })
  // Official list-cell shadowing: lower priority wins. Disposal reveals the
  // original entry again; all other General rows retain their registrations.
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'appearance', order: 10, priority: -10,
  }, ConnectedAppearance))
}
