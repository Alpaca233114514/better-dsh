import { useCallback, useEffect, useRef, useState } from 'react'
import { unwrap, type GitRemote, type GitState, type Request, type Result } from './contracts.ts'

export function Icon({ name }: { name: 'branch' | 'changes' | 'pr' | 'commit' | 'push' | 'close' | 'refresh' | 'chevron' | 'github' }) {
  // GitHub mark: https://github.com/primer/octicons (MIT; docs/OCTICONS-LICENSE.txt).
  if (name === 'github') return <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"/></svg>
  const paths = {
    branch: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M18 7c0 6-12 3-12 9"/></>,
    changes: <><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 9h6m-3-3v6m-3 4h6"/></>,
    pr: <><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10m6-14 3 3-3 3m3-3c3 0 3 4 3 6v5"/></>,
    commit: <><circle cx="12" cy="12" r="4"/><path d="M2 12h6m8 0h6"/></>,
    push: <><path d="m8 10 4-4 4 4m-4-4v15M6 16H5a4 4 0 0 1-1-8 8 8 0 0 1 15 0 4 4 0 0 1 0 8h-1"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5m11-1A8 8 0 0 0 6 6m-2 7a8 8 0 0 0 14 5"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
const isStaged = (index: string) => index !== ' ' && index !== '?'
const safeUrl = (url: string) => /^https:\/\/[^/]+\//.test(url) ? url : undefined
export function GitPanel({ sessionId, remote, onClose }: { sessionId: string; remote: GitRemote; onClose: () => void }) {
  const [state, setState] = useState<GitState>()
  const [error, setError] = useState(''), [loadError, setLoadError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('')
  const [view, setView] = useState<'changes' | 'pr'>('changes')
  const [commitOpen, setCommitOpen] = useState(false), [message, setMessage] = useState(''), [include, setInclude] = useState(true)
  const [branches, setBranches] = useState<string[]>([]), [newBranch, setNewBranch] = useState('')
  const [diff, setDiff] = useState('选择文件查看差异'), [selected, setSelected] = useState('')
  const [pr, setPR] = useState<Result['pr']>(), [prError, setPRError] = useState('')
  const [base, setBase] = useState(''), [title, setTitle] = useState(''), [body, setBody] = useState(''), [draft, setDraft] = useState(false)
  const alive = useRef(true), operation = useRef(false), generation = useRef(0), diffGeneration = useRef(0)
  const prHeading = useRef<HTMLHeadingElement>(null)
  const commitTrigger = useRef<HTMLButtonElement>(null), messageInput = useRef<HTMLTextAreaElement>(null)
  const call = useCallback(async (action: Request['action'], extra: Partial<Request> = {}) =>
    unwrap(await remote.run({ ...extra, sessionId, action })), [remote, sessionId])
  const load = useCallback(async () => {
    const version = generation.current
    try {
      const result = await call('state')
      if (alive.current && !operation.current && version === generation.current) { setState(result.state); setLoadError('') }
    } catch (e) { if (alive.current && !operation.current && version === generation.current) setLoadError((e as Error).message) }
  }, [call])
  const loadPR = useCallback(async () => {
    const version = generation.current
    try {
      const result = await call('prInfo')
      if (alive.current && version === generation.current) { setPR(result.pr); setBase(value => value || result.base || ''); setPRError('') }
    } catch (e) { if (alive.current && version === generation.current) setPRError((e as Error).message) }
  }, [call])
  useEffect(() => {
    alive.current = true
    void load(); void loadPR()
    void call('branches').then(result => { if (alive.current) setBranches(result.branches ?? []) }).catch(() => {})
    const timer = setInterval(() => { if (!document.hidden && !operation.current) void load() }, 5000)
    return () => { alive.current = false; clearInterval(timer); generation.current++; diffGeneration.current++ }
  }, [load, loadPR, call])
  useEffect(() => { if (commitOpen) messageInput.current?.focus() }, [commitOpen])
  useEffect(() => { if (view === 'pr') prHeading.current?.focus() }, [view])
  const openPR = () => { if (operation.current) return; setCommitOpen(false); setView('pr'); void loadPR() }
  const act = async (action: Request['action'], extra: Partial<Request> = {}) => {
    if (operation.current) return
    operation.current = true; generation.current++; diffGeneration.current++
    setBusy(action); setError(''); setNotice('')
    try {
      const result = await call(action, extra)
      if (!alive.current) return
      if (result.state) setState(result.state)
      if (result.pr) setPR(result.pr)
      setNotice(result.notice ?? '操作完成')
      if (action === 'commit' || action === 'commitPush') { setMessage(''); setCommitOpen(false); setSelected(''); setDiff('选择文件查看差异'); commitTrigger.current?.focus() }
      if (['switch', 'createBranch'].includes(action)) {
        setNewBranch(''); setSelected(''); setDiff('选择文件查看差异'); setPR(undefined); setPRError(''); setBase('')
        void loadPR()
        const data = await call('branches'); if (alive.current) setBranches(data.branches ?? [])
      }
      if (action === 'stage' || action === 'unstage') { setSelected(''); setDiff('选择文件查看差异') }
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { operation.current = false; if (alive.current) { setBusy(''); void load() } }
  }
  const showDiff = async (path: string, staged: boolean) => {
    const version = ++diffGeneration.current
    setSelected(`${staged}:${path}`); setDiff('正在读取差异…')
    try {
      const result = await call('diff', { path, staged })
      if (alive.current && version === diffGeneration.current) setDiff(result.text ?? '')
    } catch (e) { if (alive.current && version === diffGeneration.current) setDiff((e as Error).message) }
  }
  const hasChanges = !!state?.files.length
  const writable = !!state && state.writable !== false && !busy && !loadError
  const canCommit = writable && !state.protected && !!state.branch && state.files.some(f => include || isStaged(f.index))
  const canPush = writable && !state.protected && !!state.branch
  const closeCommit = () => { setCommitOpen(false); commitTrigger.current?.focus() }
  return <section className="dshgit" aria-label="DSHGit" aria-busy={!!busy} onKeyDown={event => {
    if (event.key === 'Escape' && commitOpen) { event.preventDefault(); event.stopPropagation(); closeCommit() }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && commitOpen && canCommit) {
      event.preventDefault(); event.stopPropagation(); void act(event.shiftKey ? 'commitPush' : 'commit', { message, includeUnstaged: include })
    }
  }}>
    <header className="dg-top"><span className="dg-brand"><Icon name="branch"/>DSHGit</span>
      <div className="dg-tools"><button title="刷新" aria-label="刷新 Git 状态" disabled={!!busy} onClick={() => { void load(); void loadPR() }}><Icon name="refresh"/></button>
        <button aria-label="关闭 DSHGit" onClick={onClose}><Icon name="close"/></button></div>
    </header>
    {(error || loadError) && <div className="dg-alert" role="alert">{error || loadError}</div>}
    {notice && <div className="dg-notice" role="status">{notice}</div>}
    {!state ? <div className="dg-empty">{error || loadError ? '请确认当前工作区为 Git 仓库。' : '正在读取工作区…'}</div> : <>
      <div className="dg-overview">
        <div className="dg-card">
          <div className="dg-card-title"><span title={state.root}>{state.name}</span><span className="dg-muted">{state.files.length} 个文件</span></div>
          <button className="dg-row" data-active={view === 'changes'} onClick={() => setView('changes')}><Icon name="changes"/><span>变更</span><span className="dg-stats" title="已跟踪文件的暂存区与工作区行数；未跟踪文件暂存后计入"><b>+{state.additions.toLocaleString()}</b><em>-{state.deletions.toLocaleString()}</em></span></button>
          <button className="dg-row" data-active={view === 'pr'} onClick={openPR}><Icon name="github"/><span>{pr ? '现有 Pull Request' : '创建 Pull Request'}</span><span className="dg-muted">{pr ? `#${pr.number}` : '→'}</span></button>
        </div>
        <div className="dg-branch-info"><span><Icon name="branch"/>{state.branch || 'Detached HEAD'}</span>
          <span className="dg-muted">{state.upstream ? `↑ ${state.ahead}  ↓ ${state.behind}` : '尚未关联上游'}</span>
          {state.protected && <span className="dg-muted">请在提交前创建功能分支</span>}
        </div>
      </div>
      {view === 'changes' ? <div className="dg-workspace">
        <div className="dg-files">
          {(['staged', 'working'] as const).map(group => {
            const files = state.files.filter(f => group === 'staged' ? isStaged(f.index) : f.worktree !== ' ')
            return <section key={group} aria-label={group === 'staged' ? '已暂存' : '未暂存'}>
              <h3>{group === 'staged' ? '已暂存' : '未暂存'}<span>{files.length}</span></h3>
              {files.map(file => <div className="dg-file" key={file.path} data-active={selected === `${group === 'staged'}:${file.path}`}>
                <button className="dg-file-name" title={file.original ? `${file.original} → ${file.path}` : file.path} onClick={() => { void showDiff(file.path, group === 'staged') }}>
                  <span className="dg-status">{file.index === '?' ? 'U' : group === 'staged' ? file.index : file.worktree}</span><span>{file.path}</span>
                </button><button className="dg-stage" disabled={!writable} aria-label={`${group === 'staged' ? '取消暂存' : '暂存'} ${file.path}`} title={group === 'staged' ? '取消暂存' : '暂存'} onClick={() => { void act(group === 'staged' ? 'unstage' : 'stage', { path: file.path }) }}>{group === 'staged' ? '−' : '+'}</button>
              </div>)}
            </section>
          })}
          {!state.files.length && <div className="dg-empty">工作区干净<br/><span className="dg-muted">所有变更均已提交</span></div>}
        </div>
        <div className="dg-diff"><div className="dg-diff-title">{selected ? selected.slice(selected.indexOf(':') + 1) : '文件差异'}</div><pre aria-label="文件差异内容">{diff.split('\n').map((line, i) => <span key={i} className={line.startsWith('+') ? 'dg-added' : line.startsWith('-') ? 'dg-removed' : line.startsWith('@@') ? 'dg-hunk' : ''}>{line}{'\n'}</span>)}</pre></div>
      </div> : <div className="dg-pr">
        <div className="dg-pr-heading"><Icon name="github"/><h2 ref={prHeading} tabIndex={-1}>{pr ? 'Pull Request' : '创建 Pull Request'}</h2></div>
        {prError && <div className="dg-alert" role="alert">{prError}</div>}
        {pr ? <div className="dg-pr-existing"><span className="dg-muted">#{pr.number}</span><h3>{pr.title}</h3><a href={safeUrl(pr.url)} target="_blank" rel="noreferrer">在 GitHub 中打开 ↗</a></div> : <form onSubmit={event => { event.preventDefault(); void act('createPR', { title, body, base, draft }) }}>
          <label>目标分支<input required value={base} onChange={e => setBase(e.target.value)} placeholder="main"/></label>
          <label>标题<input maxLength={256} disabled={!!busy} value={title} onChange={e => setTitle(e.target.value)} placeholder="留空由模型根据变更生成"/></label>
          <label>描述<textarea rows={3} disabled={!!busy} value={body} onChange={e => setBody(e.target.value)} placeholder="留空由当前会话模型根据提交和差异生成"/></label>
          <div className="dg-form-footer"><label className="dg-check"><input type="checkbox" checked={draft} onChange={e => setDraft(e.target.checked)}/>创建为草稿</label>
            <button className="dg-primary" disabled={!canPush || !base.trim() || !!prError} type="submit">{busy === 'createPR' ? (!title.trim() || !body.trim() ? '正在生成并创建…' : '正在创建…') : '创建 PR'}</button></div>
        </form>}
      </div>}
      <footer className="dg-footer"><span className="dg-muted" role="status">{busy ? (['commit', 'commitPush'].includes(busy) && !message.trim() ? '正在生成说明并提交…' : '正在执行 Git 操作…') : state.writable === false ? '只读工作区' : state.files.length ? `${state.files.length} 个变更文件` : '没有待提交的变更'}</span>
        <button ref={commitTrigger} className="dg-primary" aria-expanded={commitOpen} aria-controls="dshgit-commit" disabled={!!busy} onClick={() => setCommitOpen(value => !value)}><Icon name="commit"/>提交与推送<Icon name="chevron"/></button>
      </footer>
      {commitOpen && <div className="dg-commit-shade" onClick={closeCommit}><section id="dshgit-commit" className="dg-commit-card" aria-label="提交与推送" onClick={e => e.stopPropagation()}>
        <div className="dg-branch-select"><Icon name="branch"/><select aria-label="当前分支" value={state.branch} disabled={!writable} onChange={e => { void act('switch', { branch: e.target.value }) }}>{!state.branch && <option value="">Detached HEAD</option>}{Array.from(new Set([state.branch, ...branches])).filter(Boolean).map(branch => <option key={branch}>{branch}</option>)}</select></div>
        <div className="dg-new-branch"><input aria-label="新分支名称" value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="codex/新分支"/><button disabled={!writable || !newBranch.trim()} onClick={() => { void act('createBranch', { branch: newBranch }) }}>创建分支</button></div>
        {hasChanges && <><textarea ref={messageInput} className="dg-message" aria-label="提交信息" disabled={!!busy} value={message} onChange={e => setMessage(e.target.value)} placeholder="提交信息（留空由当前会话模型生成）…" rows={4}/>
        <div className="dg-include"><label className="dg-check"><input type="checkbox" checked={include} disabled={!!busy} onChange={e => setInclude(e.target.checked)}/>包含未暂存的更改</label><span className="dg-stats"><b>+{state.additions.toLocaleString()}</b><em>-{state.deletions.toLocaleString()}</em></span></div></>}
        <div className="dg-commit-actions">{hasChanges && <><button disabled={!canCommit} onClick={() => { void act('commit', { message, includeUnstaged: include }) }}><Icon name="commit"/><span>提交</span><kbd>Ctrl/⌘ ↵</kbd></button>
          <button disabled={!canCommit} onClick={() => { void act('commitPush', { message, includeUnstaged: include }) }}><Icon name="push"/><span>提交并推送</span><kbd>Ctrl/⌘ ⇧ ↵</kbd></button></>}
          {!hasChanges && <button disabled={!canPush} onClick={() => { void act('push') }}><Icon name="push"/><span>推送</span></button>}
          <button disabled={!!busy} onClick={openPR}><Icon name="github"/><span>{pr ? '查看 Pull Request' : '创建 Pull Request'}</span></button>
          {hasChanges && <button disabled={!canPush} onClick={() => { void act('push') }}><Icon name="push"/><span>推送</span></button>}</div>
      </section></div>}
    </>}
  </section>
}
