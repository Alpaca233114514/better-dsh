// Client half: a single-file browser module.
//
// The host serves this file through `exports["./client"]`, so relative
// imports cannot resolve — everything lives in one file and dependencies
// arrive through `require` inside the module factory.

window.__ModuleLoader__.load({
  id: 'dsh-next-suggestion',
  factory(require) {
    const React = require('react')
    const reactDom = require('react-dom')
    const h = React.createElement

    // ---------------------------------------------------------------------
    // Constants and storage
    // ---------------------------------------------------------------------

    const ENABLED_KEY = 'dsh.next-suggestion.enabled' // '0' = off; anything else (or absent) = on
    const ACCEPTED_KEY = 'dsh.next-suggestion.accepted' // '1' = accepted once; the hint never returns
    const CHANGE_EVENT = 'dsh-next-suggestion:change'
    const DEFAULT_POLL_FALLBACK_MS = 30000
    const REPOSITION_MS = 250

    let pollFallbackMs = DEFAULT_POLL_FALLBACK_MS // replaced by the Host config value when available
    let failureReport = { count: 0, at: 0 }

    // ---------------------------------------------------------------------
    // i18n
    // ---------------------------------------------------------------------

    function language() {
      const tag = document.documentElement.lang || navigator.language
      return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    const STRINGS = {
      en: {
        title: 'Show predicted messages',
        description: 'Predict the message you are about to send from the conversation.',
        hint: 'Press Tab to accept',
        configTitle: 'Next Suggestion settings',
        configUnavailable:
          'This Harness build exposes no automatic form for these settings. Edit the plugin config in the profile cordis.patch.yml instead.',
        configCacheTtl: 'Cache lifetime',
        configCacheTtlHint:
          'How long a prediction is reused within one turn, in milliseconds. 60000 is one minute.',
        configCacheMax: 'Cached sessions',
        configCacheMaxHint: 'How many sessions keep a cached prediction, from 1 to 5000.',
        configEffort: 'Reasoning effort',
        configEffortHint:
          'The effort requested from the model; when the model does not list it, the closest level is used.',
        configFallback: 'Fallback interval',
        configFallbackHint:
          'Used only when the session state is unavailable, in milliseconds, from 5000 to 600000.',
        configSaving: 'Saving…',
        configSaved: 'Saved, applied by the Host',
        configFailed: 'Save failed, try again',
        configInvalid: 'Value out of range',
        configLoading: 'Loading settings…',
      },
      zh: {
        title: '显示预测消息',
        description: '根据对话预测你接下来要发送的消息。',
        hint: '按 Tab 接受',
        configTitle: '预测消息设置',
        configUnavailable: '当前 Harness 没有提供这块配置的自动表单，请改 profile 的 cordis.patch.yml。',
        configCacheTtl: '缓存有效期',
        configCacheTtlHint: '同一轮对话里复用上次预测的时长，单位毫秒，60000 是 1 分钟。',
        configCacheMax: '缓存条数上限',
        configCacheMaxHint: '最多保留多少个会话的预测，1 到 5000。',
        configEffort: '推理强度',
        configEffortHint: '向模型请求的推理档位，模型不支持时取最接近的档。',
        configFallback: '兜底轮询间隔',
        configFallbackHint: '只在拿不到会话状态时使用，单位毫秒，5000 到 600000。',
        configSaving: '保存中…',
        configSaved: '已保存，Host 已生效',
        configFailed: '保存失败，请重试',
        configInvalid: '数值超出范围',
        configLoading: '正在读取配置…',
      },
    }

    function t(key) {
      return STRINGS[language()]?.[key] ?? STRINGS.en[key] ?? key
    }

    // ---------------------------------------------------------------------
    // Storage helpers (localStorage may be unavailable)
    // ---------------------------------------------------------------------

    function readEnabled() {
      try {
        return window.localStorage.getItem(ENABLED_KEY) !== '0'
      } catch {
        return true
      }
    }

    function writeEnabled(next) {
      try {
        window.localStorage.setItem(ENABLED_KEY, next ? '1' : '0')
      } catch { /* storage unavailable */ }
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }))
    }

    function readAccepted() {
      try {
        return window.localStorage.getItem(ACCEPTED_KEY) === '1'
      } catch {
        return false
      }
    }

    function markAccepted() {
      try {
        window.localStorage.setItem(ACCEPTED_KEY, '1')
      } catch { /* storage unavailable */ }
    }

    // ---------------------------------------------------------------------
    // HTTP helpers
    // ---------------------------------------------------------------------

    // Resolve an absolute URL against the page base, tolerating custom
    // desktop schemes such as `dsh-app://app/`.
    function apiUrl(path) {
      const base = new URL(document.baseURI)
      base.search = ''
      base.hash = ''
      if (!base.pathname.endsWith('/')) base.pathname = base.pathname.replace(/[^/]*$/, '')
      return new URL(String(path).replace(/^\//, ''), base).toString()
    }

    async function loadConfig() {
      try {
        const response = await fetch(apiUrl('next-suggestion/api/config'))
        if (!response.ok) return
        const data = await response.json()
        pollFallbackMs = data.fallbackPollMs
      } catch { /* retain the default interval when the host is unavailable */ }
    }

    async function postNote(payload) {
      try {
        await fetch(apiUrl('next-suggestion/api/note'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch { /* diagnostics are best-effort */ }
    }

    function reportFailure(status) {
      const now = Date.now()
      failureReport.count += 1
      if (now - failureReport.at >= 60000) {
        failureReport.at = now
        postNote({ tag: 'predict-failed', status, count: failureReport.count })
      }
      if (failureReport.count >= 3) {
        console.warn('[next-suggestion] prediction keeps failing', { status, count: failureReport.count })
      }
    }

    // ---------------------------------------------------------------------
    // Composer state helpers
    // ---------------------------------------------------------------------

    function canQuery() {
      return document.visibilityState !== 'hidden' && document.hasFocus()
    }

    function isEmptyEditable(element) {
      if (!element) return false
      if (element.tagName === 'TEXTAREA') return element.value === ''
      if (element.isContentEditable === true) {
        return String(element.innerText ?? element.textContent ?? '').trim() === ''
      }
      return false // INPUT and everything else is never claimed
    }

    function composerEditableOf(anchor) {
      let node = anchor ?? null
      for (let depth = 0; node && depth < 8; depth += 1) {
        const found = typeof node.querySelector === 'function'
          ? node.querySelector('[contenteditable="true"]')
          : null
        if (found) return found
        node = node.parentElement
      }
      return typeof document.querySelector === 'function'
        ? document.querySelector('[contenteditable="true"]')
        : null
    }

    function placeholderOf(editable) {
      let node = editable?.parentElement ?? null
      for (let depth = 0; node && depth < 6; depth += 1) {
        const found = typeof node.querySelector === 'function'
          ? node.querySelector('[data-composer-placeholder]')
          : null
        if (found) return found
        node = node.parentElement
      }
      return null
    }

    function textHostOf(editable) {
      let host = editable
      for (let depth = 0; depth < 4; depth += 1) {
        const child = host?.firstElementChild
        if (!child) break
        const height = child.getBoundingClientRect().height
        if (!(height > 0)) break
        host = child
      }
      return host
    }

    // Locate the first line box of the composer: where the ghost text starts.
    function caretBoxOf(editable) {
      if (!editable) return null
      const host = textHostOf(editable)
      const styles = window.getComputedStyle(host)
      const fontSize = parseFloat(styles.fontSize)
      const parsedLineHeight = parseFloat(styles.lineHeight)
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.5

      const usable = rect => (rect && rect.height > 0 ? rect : null)

      // a) The placeholder marks the first line of a pristine composer. The
      //    ghost hides it with visibility, but its rect stays valid.
      let rect = usable(placeholderOf(editable)?.getBoundingClientRect?.())
      // b) The caret itself.
      if (!rect) {
        try {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            if (editable.contains(range.startContainer)) {
              rect = usable(range.getBoundingClientRect?.())
            }
          }
        } catch { /* selection unavailable */ }
      }
      // c) The first visible client rect of the text host.
      if (!rect) {
        try {
          const range = document.createRange()
          range.selectNodeContents(host)
          const rects = range.getClientRects?.() ?? []
          rect = usable(Array.from(rects).find(clientRect => clientRect.height > 0))
            ?? usable(range.getBoundingClientRect?.())
        } catch { /* range unavailable */ }
      }
      // d) The text host itself.
      if (!rect) rect = usable(host.getBoundingClientRect?.())
      if (!rect) return null

      // Clamp a tall container (multi-line scaffolding, attachments) down to
      // the first text line.
      let top = rect.top
      let height = rect.height
      if (height > lineHeight * 1.6) {
        top = rect.top + parseFloat(styles.paddingTop)
        height = lineHeight
      }

      const outer = editable.getBoundingClientRect()
      const maxWidth = Math.max(120, outer.width - (rect.left - outer.left) - 12)
      return {
        left: rect.left,
        top,
        height,
        fontSize,
        fontFamily: styles.fontFamily,
        fontWeight: styles.fontWeight,
        letterSpacing: styles.letterSpacing,
        maxWidth,
      }
    }

    // ---------------------------------------------------------------------
    // Hooks
    // ---------------------------------------------------------------------

    function useEnabled() {
      const [enabled, setEnabled] = React.useState(readEnabled)
      React.useEffect(() => {
        const onChange = () => setEnabled(readEnabled())
        window.addEventListener(CHANGE_EVENT, onChange)
        return () => window.removeEventListener(CHANGE_EVENT, onChange)
      }, [])
      return enabled
    }

    function useForeground() {
      const [foreground, setForeground] = React.useState(() => ({ focused: canQuery(), wake: 0 }))
      React.useEffect(() => {
        const update = () => setForeground(previous => ({ focused: canQuery(), wake: previous.wake + 1 }))
        document.addEventListener('visibilitychange', update)
        window.addEventListener('focus', update)
        window.addEventListener('blur', update)
        return () => {
          document.removeEventListener('visibilitychange', update)
          window.removeEventListener('focus', update)
          window.removeEventListener('blur', update)
        }
      }, [])
      return foreground
    }

    function usePrediction(sessionId, active, running, wake) {
      const [state, setState] = React.useState({ sessionId, text: '' })
      const previous = React.useRef({ sessionId, running })

      React.useEffect(() => {
        const turnEnded = previous.current.sessionId === sessionId
          && previous.current.running === true && running === false
        previous.current = { sessionId, running }
        if (running === true) setState({ sessionId, text: '' })
        if (!active || !sessionId || running === true) return undefined

        const controller = new AbortController()
        let inFlight = false
        const run = async force => {
          if (!canQuery() || inFlight) return
          inFlight = true
          try {
            const response = await fetch(apiUrl('next-suggestion/api/predict'), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(force ? { sessionId, force: true } : { sessionId }),
              signal: controller.signal,
            })
            if (!response.ok) throw new Error(String(response.status))
            const data = await response.json()
            if (controller.signal.aborted) return
            failureReport.count = 0
            setState({ sessionId, text: data.text })
          } catch (error) {
            if (!controller.signal.aborted) reportFailure(error.message)
          } finally {
            inFlight = false
          }
        }

        void run(turnEnded)
        const interval = running === undefined
          ? window.setInterval(() => { void run(false) }, pollFallbackMs)
          : null
        return () => {
          controller.abort()
          if (interval !== null) window.clearInterval(interval)
        }
      }, [sessionId, active, running, wake])

      return state.sessionId === sessionId && running !== true ? state : { text: '' }
    }

    // ---------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------

    function Ghost({ text, hint, origin, onAccept }) {
      return reactDom.createPortal(
        h('div', {
          'data-dsh-next-suggestion': '',
          style: {
            position: 'fixed',
            left: `${origin.left}px`,
            top: `${origin.top}px`,
            width: `${origin.maxWidth}px`,
            maxWidth: `${origin.maxWidth}px`,
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
            fontFamily: origin.fontFamily,
            fontSize: `${origin.fontSize}px`,
            lineHeight: `${origin.height}px`,
            fontWeight: origin.fontWeight,
            letterSpacing: origin.letterSpacing,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: 'var(--dsw-alias-text-tertiary, rgba(0,0,0,0.45))',
            zIndex: 40,
          },
        },
          h('span', { style: { display: 'inline' } }, text),
          hint
            ? h('span', {
              role: 'button',
              tabIndex: -1,
              onMouseDown: event => {
                event.preventDefault() // keep focus in the composer
                onAccept()
              },
              style: {
                display: 'inline-block',
                marginLeft: 6,
                verticalAlign: 'baseline',
                pointerEvents: 'auto',
                cursor: 'pointer',
                padding: '0 6px',
                borderRadius: 7,
                background: 'color-mix(in srgb, currentColor 9%, transparent)',
                color: 'var(--dsw-alias-text-tertiary, rgba(0,0,0,0.45))',
                opacity: 0.75,
                fontSize: `${Math.max(11, origin.fontSize - 2)}px`,
                lineHeight: `${Math.max(16, origin.height - 4)}px`,
              },
            }, hint)
            : null),
        document.body)
    }

    function Suggestion(props) {
      const { sessionId } = props
      const enabled = useEnabled()
      const input = props.useInput(state => state)
      const snapshot = typeof props.useSession === 'function' ? props.useSession(selector => selector) : undefined
      const running = typeof props.useSession === 'function' ? Boolean(snapshot?.running) : undefined
      const draft = input.draft
      const foreground = useForeground()
      const [composing, setComposing] = React.useState(false)
      const active = enabled && foreground.focused && !composing && draft.length === 0
        && input.attachmentIds.length === 0 && input.phase === 'plain'
      const { text } = usePrediction(sessionId, active, running, foreground.wake)

      const [dismissed, setDismissed] = React.useState(null)
      const [origin, setOrigin] = React.useState(null)
      const anchorRef = React.useRef(null)

      const matches = entry => entry?.sessionId === sessionId && entry.text === text
      const visible = active && Boolean(text) && !matches(dismissed)

      React.useEffect(() => {
        const start = event => {
          if (event.target === composerEditableOf(anchorRef.current)) setComposing(true)
        }
        const end = () => setComposing(false)
        window.addEventListener('compositionstart', start, true)
        window.addEventListener('compositionend', end, true)
        return () => {
          window.removeEventListener('compositionstart', start, true)
          window.removeEventListener('compositionend', end, true)
        }
      }, [sessionId])

      // Follow the composer geometry while the ghost is on screen.
      React.useEffect(() => {
        if (!visible) {
          setOrigin(null)
          return undefined
        }
        const measure = () => {
          const editable = composerEditableOf(anchorRef.current)
          setOrigin(editable ? caretBoxOf(editable) : null)
        }
        measure()
        const interval = window.setInterval(measure, REPOSITION_MS)
        window.addEventListener('resize', measure)
        window.addEventListener('scroll', measure, true)
        return () => {
          window.clearInterval(interval)
          window.removeEventListener('resize', measure)
          window.removeEventListener('scroll', measure, true)
        }
      }, [visible, draft])

      // Yield the native placeholder to the ghost while both would show.
      React.useEffect(() => {
        if (!visible) return undefined
        const editable = composerEditableOf(anchorRef.current)
        const placeholder = editable ? placeholderOf(editable) : null
        if (!placeholder) return undefined
        const previous = placeholder.style.visibility
        placeholder.style.visibility = 'hidden'
        return () => {
          placeholder.style.visibility = previous
        }
      }, [visible])

      function insert(via) {
        props.inputActions.setDraft(text)
        markAccepted()
        postNote({ tag: 'insert', sessionId, via, method: 'setDraft', length: text.length })
      }

      React.useEffect(() => {
        if (!visible) return undefined
        const onKeyDown = event => {
          if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
          if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
          if (event.key !== 'Tab' && event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== 'Escape') return
          if (event.target !== composerEditableOf(anchorRef.current) || !isEmptyEditable(event.target)) return
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Escape') {
            setDismissed({ sessionId, text })
            postNote({ tag: 'dismiss', sessionId, via: 'escape' })
          } else if (event.key === 'Tab') {
            insert('tab')
          } else {
            insert(event.key === 'Enter' ? 'enter' : 'arrow-right')
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [visible, text, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

      // The anchor stays mounted forever; the ghost locates itself from it.
      return h('div', {
        ref: anchorRef,
        'data-dsh-next-suggestion-anchor': '',
        style: { display: 'none' },
      },
        visible && origin
          ? h(Ghost, {
            text,
            hint: readAccepted() ? '' : t('hint'),
            origin,
            onAccept: () => insert('click'),
          })
          : null)
    }

    function Toggle({ checked, onChange, label }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        onClick: () => onChange(!checked),
        style: {
          position: 'relative',
          width: 42,
          height: 24,
          borderRadius: 12,
          border: 'none',
          background: checked
            ? 'var(--dsw-alias-button-primary, #247bbf)'
            : 'var(--dsw-alias-fill-tertiary, rgba(0,0,0,0.18))',
          transition: 'background 120ms ease',
          flexShrink: 0,
        },
      },
        h('span', {
          'aria-hidden': 'true',
          style: {
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            transition: 'left 120ms ease',
          },
        }))
    }

    function SettingsRow() {
      const enabled = useEnabled()
      return h('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '12px 0',
          width: '100%',
        },
      },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h('span', { style: { fontSize: 14, color: 'var(--dsw-alias-text-primary, inherit)' } }, t('title')),
          h('span', { style: { fontSize: 12, lineHeight: 1.4, color: 'var(--dsw-alias-text-tertiary, rgba(0,0,0,0.45))' } }, t('description'))),
        h(Toggle, { checked: enabled, onChange: writeEnabled, label: t('title') }))
    }

    // ---------------------------------------------------------------------
    // Plugin config form (plugins.row.config slot)
    // ---------------------------------------------------------------------

    const CONFIG_FIELDS = [
      { key: 'cacheTtlMs', kind: 'number', min: 60000, max: 86400000, labelKey: 'configCacheTtl', hintKey: 'configCacheTtlHint' },
      { key: 'cacheMaxEntries', kind: 'number', min: 1, max: 5000, labelKey: 'configCacheMax', hintKey: 'configCacheMaxHint' },
      { key: 'preferredReasoningEffort', kind: 'choice', options: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], labelKey: 'configEffort', hintKey: 'configEffortHint' },
      { key: 'fallbackPollMs', kind: 'number', min: 5000, max: 600000, labelKey: 'configFallback', hintKey: 'configFallbackHint' },
    ]

    const MUTED = { color: 'var(--dsw-alias-text-tertiary, rgba(0,0,0,0.45))' }

    const CONTROL = {
      boxSizing: 'border-box',
      width: '100%',
      maxWidth: 320,
      padding: '6px 10px',
      fontSize: 14,
      fontFamily: 'inherit',
      color: 'var(--dsw-alias-text-primary, inherit)',
      background: 'var(--dsw-alias-bg-primary, transparent)',
      border: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,0.18))',
      borderRadius: 8,
    }

    function ConfigPage() {
      const [state, setState] = React.useState({ status: 'loading', values: undefined, note: '' })

      React.useEffect(() => {
        let cancelled = false
        try {
          void fetch(apiUrl('next-suggestion/api/config'))
            .then(response => (response.ok ? response.json() : Promise.reject(new Error('config-unavailable'))))
            .then(data => {
              if (cancelled) return
              const interval = data?.fallbackPollMs
              if (typeof interval === 'number' && Number.isFinite(interval) && interval >= 5000) {
                pollFallbackMs = interval
              }
              if (data?.editable === true) {
                setState({ status: 'ready', values: data.values ?? {}, note: '' })
              } else {
                setState({ status: 'unavailable', values: undefined, note: '' })
              }
            })
            .catch(() => {
              if (!cancelled) setState({ status: 'unavailable', values: undefined, note: '' })
            })
        } catch {
          setState({ status: 'unavailable', values: undefined, note: '' })
        }
        return () => { cancelled = true }
      }, [])

      async function commit(spec, raw) {
        let value = raw
        if (spec.kind === 'number') {
          value = Number(raw)
          if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
            setState(previous => ({ ...previous, note: 'invalid' }))
            return
          }
        }
        setState(previous => ({ ...previous, note: 'saving' }))
        try {
          const response = await fetch(apiUrl('next-suggestion/api/config'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ field: spec.key, value }),
          })
          if (!response.ok) throw new Error('config-save-failed')
          const data = await response.json()
          const interval = data?.fallbackPollMs
          if (typeof interval === 'number' && Number.isFinite(interval) && interval >= 5000) {
            pollFallbackMs = interval
          }
          setState(previous => ({
            ...previous,
            values: { ...(previous.values ?? {}), ...(data?.values ?? { [spec.key]: value }) },
            note: 'saved',
          }))
        } catch {
          setState(previous => ({ ...previous, note: 'failed' }))
        }
      }

      if (state.status !== 'ready') {
        return h('section', { 'data-dsh-next-suggestion-config': '' },
          h('p', { style: MUTED },
            state.status === 'loading' ? t('configLoading') : t('configUnavailable')))
      }

      return h('section', { 'data-dsh-next-suggestion-config': '' },
        h('h3', { style: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' } }, t('configTitle')),
        CONFIG_FIELDS.map(spec => h('label', {
          key: spec.key,
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '12px 0',
            borderBottom: '1px solid var(--dsw-alias-border-secondary, rgba(0,0,0,0.08))',
          },
        },
          h('span', { style: { fontSize: 14 } }, t(spec.labelKey)),
          h('span', { style: { fontSize: 12, ...MUTED } }, t(spec.hintKey)),
          spec.kind === 'choice'
            ? h('select', {
              style: CONTROL,
              defaultValue: state.values?.[spec.key] === undefined ? undefined : String(state.values[spec.key]),
              onChange: event => { void commit(spec, event.target.value) },
            },
              spec.options.map(option => h('option', { key: option, value: option }, option)))
            : h('input', {
              type: 'number',
              min: spec.min,
              max: spec.max,
              style: CONTROL,
              defaultValue: state.values?.[spec.key] === undefined ? undefined : String(state.values[spec.key]),
              onBlur: event => { void commit(spec, event.target.value) },
              onKeyDown: event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void commit(spec, event.target.value)
                }
              },
            }))),
        state.note
          ? h('p', {
            role: 'status',
            style: state.note === 'failed' || state.note === 'invalid'
              ? { ...MUTED, color: '#c0392b' }
              : MUTED,
          }, t(`config${state.note.charAt(0).toUpperCase()}${state.note.slice(1)}`))
          : null)
    }

    // ---------------------------------------------------------------------
    // Slot registration
    // ---------------------------------------------------------------------

    function apply(ctx) {
      void loadConfig()

      ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register(
          { name: 'conversation.composer.dock', id: 'next-suggestion', order: 6, registrant: 'dsh-next-suggestion' },
          Suggestion))

      ctx.slots.inject('settings.general.item', () =>
        ctx.slots.register(
          { name: 'settings.general.item', id: 'next-suggestion', order: 21, registrant: 'dsh-next-suggestion' },
          SettingsRow))

      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register(
          { name: 'plugins.row.config', key: 'dsh-next-suggestion#next-suggestion', registrant: 'dsh-next-suggestion' },
          ConfigPage))
    }

    return {
      inject: ['slots'],
      apply,
    }
  },
})
