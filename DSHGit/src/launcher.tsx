import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { unwrap, type GitRemote, type GitState } from './contracts.ts'
import { GitPanel, Icon } from './panel.tsx'

/** The header slot owns this card; only its own conversation reserves space. */
export function GitLauncher({ sessionId, remote }: { sessionId: string; remote: GitRemote }) {
  const [expanded, setExpanded] = useState<boolean | null>(null), [wide, setWide] = useState(true)
  const visible = expanded ?? wide
  const [detail, setDetail] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [state, setState] = useState<GitState>(), [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement>(null), changes = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null), id = useId()
  useEffect(() => {
    const header = trigger.current?.closest('header')
    const root = trigger.current?.closest<HTMLElement>('[data-phase]')
    // Stable host markers, not generated CSS module class names. A different
    // host layout can still show the card without modifying unrelated content.
    if (!header || !root) return
    setHost(root)
    let wasWide: boolean | undefined
    const measure = () => {
      // Desktop can mount the header before its column has a measured width.
      if (!root.clientWidth) return
      const wide = root.clientWidth >= 900
      root.setAttribute('data-dg-wide', String(wide))
      setWide(wide)
      if (wasWide !== undefined && wide !== wasWide) setExpanded(null)
      wasWide = wide
      root.style.setProperty('--dg-header-height', `${header.offsetHeight}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root); observer.observe(header)
    return () => {
      observer.disconnect(); root.removeAttribute('data-dg-wide')
      root.style.removeProperty('--dg-header-height')
    }
  }, [])
  useEffect(() => {
    if (!host || !visible) return
    host.classList.add('dg-host')
    let body: HTMLElement | null = null
    const attach = () => {
      body = host.querySelector<HTMLElement>('[data-conversation-content]')
      body?.classList.add('dg-conversation-body')
      return !!body
    }
    // Native slots may insert wrappers and resolve the body after the header.
    const observer = new MutationObserver(() => { if (attach()) observer.disconnect() })
    if (!attach()) observer.observe(host, { childList: true, subtree: true })
    return () => { observer.disconnect(); body?.classList.remove('dg-conversation-body'); host.classList.remove('dg-host') }
  }, [host, visible])
  useEffect(() => {
    if (!visible || detail) return
    let alive = true, pending = false
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const result = unwrap(await remote.run({ sessionId, action: 'state' }))
        if (alive) { setState(result.state); setError('') }
      } catch (e) { if (alive) setError((e as Error).message) }
      finally { pending = false }
    }
    void load()
    const timer = setInterval(() => { if (!document.hidden) void load() }, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [remote, sessionId, visible, detail])
  useEffect(() => {
    if (detail) dialog.current?.showModal()
    else dialog.current?.close()
  }, [detail])
  const closeDetail = () => { setDetail(false); changes.current?.focus() }
  const closeCard = () => { setExpanded(false); trigger.current?.focus() }
  return <>
    <button ref={trigger} type="button" className="dg-launcher" title={visible ? '收起 DSHGit' : '展开 DSHGit'} aria-label={visible ? '收起 DSHGit' : '展开 DSHGit'} aria-expanded={visible} aria-controls={id} onClick={() => setExpanded(!visible)} accessKey="g"><Icon name="branch"/></button>
    {visible && createPortal(<aside id={id} className={`dg-sidebar${host ? '' : ' dg-sidebar-floating'}`} aria-label="DSHGit 工作区" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCard() }
    }}>
      <div className="dg-sidebar-heading"><span title={state?.root}>{state?.name ?? '工作区'}</span><button type="button" aria-label="收起 DSHGit" title="收起" onClick={closeCard}><Icon name="close"/></button></div>
      {error ? <div className="dg-sidebar-error" role="alert">{error}</div> : <>
        <button ref={changes} type="button" className="dg-sidebar-changes" aria-haspopup="dialog" onClick={() => setDetail(true)} disabled={!state}>
          <Icon name="changes"/><span>变更</span>{state && <span className="dg-stats"><b>+{state.additions.toLocaleString()}</b><em>-{state.deletions.toLocaleString()}</em></span>}
        </button>
        <div className="dg-sidebar-section"><span>当前分支</span><span>{state ? `${state.files.length} 个变更` : '正在读取…'}</span></div>
        {state && <><div className="dg-sidebar-branch" title={state.branch || 'Detached HEAD'}><Icon name="branch"/><span>{state.branch || 'Detached HEAD'}</span></div>
          <button type="button" className="dg-sidebar-open" onClick={() => setDetail(true)}>查看全部<Icon name="chevron"/></button></>}
      </>}
    </aside>, host ?? document.body)}
    {createPortal(<dialog ref={dialog} className="dg-dialog" aria-label="DSHGit Git 面板" onCancel={event => { event.preventDefault(); closeDetail() }} onClick={event => { if (event.target === dialog.current) closeDetail() }}>
      {detail && <GitPanel key={sessionId} sessionId={sessionId} remote={remote} onClose={closeDetail}/>}
    </dialog>, document.body)}
  </>
}
