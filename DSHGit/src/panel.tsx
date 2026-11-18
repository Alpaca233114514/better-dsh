import { followChanges } from './refresh.ts'
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { unwrap, type GitRemote, type GitState, type Request, type Result } from './contracts.ts'
import { pendingOperation, runOperation, subscribeOperations } from './operations.ts'
import { Icon } from './icons.tsx'
import { DiffContent } from './diff-view.tsx'
import { CommitDialog } from './commit-dialog.tsx'

export { Icon } from './icons.tsx'

const isStaged = (index: string) => index !== ' ' && index !== '?'
const safeUrl = (url: string) => (/^https:\/\/[^/]+\//.test(url) ? url : undefined)

export function GitPanel({
  sessionId,
  remote,
  onClose: _onClose,
  active = true,
}: {
  sessionId: string
  remote: GitRemote
  onClose: () => void
  active?: boolean
}) {
  const [state, setState] = useState<GitState>()
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const busy = useSyncExternalStore(subscribeOperations, () => pendingOperation(sessionId))
  const commitId = useId()
  const [view, setView] = useState<'changes' | 'pr'>('changes')
  const [commitOpen, setCommitOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [include, setInclude] = useState(true)
  const [branches, setBranches] = useState<string[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [branchPrefix, setBranchPrefix] = useState(() => {
    try {
      return window.localStorage.getItem('dshgit.branchPrefix') ?? 'DSH'
    } catch {
      return 'DSH'
    }
  })
  const [diff, setDiff] = useState('选择文件查看差异')
  const [selected, setSelected] = useState('')
  const [filesOpen, setFilesOpen] = useState(false)
  const [pr, setPR] = useState<Result['pr']>()
  const [prError, setPRError] = useState('')
  const [base, setBase] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)

  const alive = useRef(true)
  const operation = useRef(false)
  const generation = useRef(0)
  const diffGeneration = useRef(0)
  const previousBusy = useRef(busy)
  const prHeading = useRef<HTMLHeadingElement>(null)
  const commitTrigger = useRef<HTMLButtonElement>(null)
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const commitDialog = useRef<HTMLDialogElement>(null)

  // Parent renders can hand over a new service proxy; the load interval must
  // survive that identity change instead of refetching state, branches and PR.
  const remoteRef = useRef(remote)
  useEffect(() => {
    remoteRef.current = remote
  }, [remote])

  const call = useCallback(
    async (action: Request['action'], extra: Partial<Request> = {}) =>
      unwrap(await remoteRef.current.run({ ...extra, sessionId, action })),
    [sessionId],
  )

  const load = useCallback(
    async (refresh = false) => {
      const version = generation.current
      try {
        const result = await call('state', refresh ? { refresh: true } : {})
        if (alive.current && !pendingOperation(sessionId) && !operation.current && version === generation.current) {
          setState(result.state)
          setLoadError('')
        }
      } catch (err) {
        if (alive.current && !pendingOperation(sessionId) && !operation.current && version === generation.current) {
          setLoadError((err as Error).message)
        }
      }
    },
    [call, sessionId],
  )

  const loadPR = useCallback(async () => {
    const version = generation.current
    try {
      const result = await call('prInfo')
      if (alive.current && version === generation.current) {
        setPR(result.pr)
        setBase(value => value || result.base || '')
        setPRError('')
      }
    } catch (err) {
      if (alive.current && version === generation.current) {
        setPRError((err as Error).message)
      }
    }
  }, [call])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      generation.current++
      diffGeneration.current++
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void call('branches')
      .then(result => {
        if (alive.current) setBranches(result.branches ?? [])
      })
      .catch(() => {})
    const stop = followChanges(
      () => remoteRef.current,
      sessionId,
      async () => {
        if (!operation.current) await load()
      },
      setLoadError,
    )
    return () => {
      stop()
      generation.current++
      diffGeneration.current++
    }
  }, [load, call, active, sessionId])

  useEffect(() => {
    if (previousBusy.current && !busy && active && !operation.current) void load()
    previousBusy.current = busy
  }, [active, busy, load])

  useEffect(() => {
    if (!active) setCommitOpen(false)
  }, [active])

  useEffect(() => {
    if (!commitOpen) return
    const dialog = commitDialog.current!
    dialog.showModal()
    messageInput.current?.focus()
    return () => dialog.close()
  }, [commitOpen])

  useEffect(() => {
    try {
      window.localStorage.setItem('dshgit.branchPrefix', branchPrefix)
    } catch {
      /* Storage may be disabled; 存储禁用时仍可编辑。 */
    }
  }, [branchPrefix])

  useEffect(() => {
    if (view === 'pr') prHeading.current?.focus()
  }, [view])

  const openPR = () => {
    if (operation.current) return
    setCommitOpen(false)
    setView('pr')
    void loadPR()
  }

  const act = async (action: Request['action'], extra: Partial<Request> = {}) => {
    if (operation.current || pendingOperation(sessionId)) return
    operation.current = true
    generation.current++
    diffGeneration.current++
    setError('')
    if (['commit', 'commitPush', 'push'].includes(action)) {
      setCommitOpen(false)
      commitTrigger.current?.focus()
    }
    try {
      const result = await runOperation(remoteRef.current, { ...extra, sessionId, action }, state?.name || 'DSHGit')
      if (!alive.current) return
      if (result.state) setState(result.state)
      if (result.pr) setPR(result.pr)
      if (action === 'commit' || action === 'commitPush') {
        setMessage('')
        setCommitOpen(false)
        setSelected('')
        setDiff('选择文件查看差异')
      }
      if (action === 'switch' || action === 'createBranch') {
        setNewBranch('')
        setSelected('')
        setDiff('选择文件查看差异')
        setPR(undefined)
        setPRError('')
        setBase('')
        if (view === 'pr') void loadPR()
        const data = await call('branches')
        if (alive.current) setBranches(data.branches ?? [])
      }
      if (action === 'stage' || action === 'unstage') {
        setSelected('')
        setDiff('选择文件查看差异')
      }
    } catch (err) {
      if (alive.current) setError((err as Error).message)
    } finally {
      operation.current = false
      if (alive.current) void load()
    }
  }

  const showDiff = async (path: string, staged: boolean) => {
    const version = ++diffGeneration.current
    setSelected(`${staged}:${path}`)
    setDiff('正在读取差异…')
    try {
      const result = await call('diff', { path, staged })
      if (alive.current && version === diffGeneration.current) setDiff(result.text ?? '')
    } catch (err) {
      if (alive.current && version === diffGeneration.current) setDiff((err as Error).message)
    }
  }

  useEffect(() => {
    if (!active || busy || !state || selected) return
    const first = state.files[0]
    if (first) void showDiff(first.path, isStaged(first.index))
  }, [active, busy, state, selected])

  const hasChanges = !!state?.files.length
  const writable = !!state && state.writable !== false && !busy && !loadError
  const canCommit = writable && !state.protected && !!state.branch && state.files.some(f => include || isStaged(f.index))
  const canPush = writable && !state.protected && !!state.branch
  const closeCommit = () => {
    setCommitOpen(false)
    commitTrigger.current?.focus()
  }
  const selectedPath = selected ? selected.slice(selected.indexOf(':') + 1) : ''

  return (
    <section
      className="dshgit"
      aria-label="DSHGit"
      aria-busy={!!busy}
      onKeyDown={event => {
        if (event.key === 'Escape' && commitOpen) {
          event.preventDefault()
          event.stopPropagation()
          closeCommit()
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && commitOpen && canCommit) {
          event.preventDefault()
          event.stopPropagation()
          void act(event.shiftKey ? 'commitPush' : 'commit', { message, includeUnstaged: include })
        }
      }}
    >
      <header className="dg-toolbar">
        <button
          className="dg-summary-pill"
          title="工作区变更"
          aria-pressed={view === 'changes'}
          onClick={() => setView('changes')}
        >
          <span>变更</span>
          {state && (
            <span className="dg-stats">
              <b>+{state.additions.toLocaleString()}</b>
              <em>-{state.deletions.toLocaleString()}</em>
            </span>
          )}
        </button>
        <button
          className="dg-branch-pill"
          title={
            state
              ? `${state.name} · ${state.branch || 'Detached HEAD'}${
                  state.upstream ? ` → ${state.upstream}（↑ ${state.ahead} ↓ ${state.behind}）` : ' · 尚未关联上游'
                }`
              : '正在读取分支'
          }
          aria-label="选择分支"
          disabled={!state || !!busy}
          onClick={() => setCommitOpen(value => !value)}
        >
          <Icon name="branch" />
          <span>{state?.branch || '分支'}</span>
          <Icon name="chevron" />
        </button>
        <div className="dg-tools">
          <button
            title={pr ? '查看 Pull Request' : '创建 Pull Request'}
            aria-label={pr ? '查看 Pull Request' : '创建 Pull Request'}
            aria-pressed={view === 'pr'}
            disabled={!state || !!busy}
            onClick={openPR}
          >
            <Icon name="github" />
          </button>
          <button
            title="刷新"
            aria-label="刷新 Git 状态"
            disabled={!!busy}
            onClick={() => {
              void load(true)
              if (view === 'pr') void loadPR()
            }}
          >
            <Icon name="refresh" />
          </button>
          <button
            title="文件列表"
            aria-label="文件列表"
            aria-expanded={filesOpen}
            onClick={() => {
              setView('changes')
              setFilesOpen(value => !value)
            }}
          >
            <Icon name="files" />
          </button>
        </div>
      </header>

      {(error || loadError) && (
        <div className="dg-alert" role="alert">
          {error || loadError}
        </div>
      )}

      {!state ? (
        <div className="dg-empty">
          {error || loadError ? '请确认当前工作区为 Git 仓库。' : '正在读取工作区…'}
        </div>
      ) : (
        <>
          {view === 'changes' ? (
            <div className="dg-workspace" data-files-open={filesOpen}>
              {filesOpen && (
                <div className="dg-files">
                  {(['staged', 'working'] as const).map(group => {
                    const staged = group === 'staged'
                    const files = state.files.filter(f => (staged ? isStaged(f.index) : f.worktree !== ' '))
                    const titleLabel = staged ? '已暂存' : '未暂存'
                    return (
                      <section key={group} aria-label={titleLabel}>
                        <h3>
                          {titleLabel}
                          <span>{files.length}</span>
                        </h3>
                        {files.map(file => (
                          <div
                            className="dg-file"
                            key={file.path}
                            data-active={selected === `${staged}:${file.path}`}
                          >
                            <button
                              className="dg-file-name"
                              title={file.original ? `${file.original} → ${file.path}` : file.path}
                              onClick={() => {
                                void showDiff(file.path, staged)
                              }}
                            >
                              <span className="dg-status">
                                {file.index === '?' ? 'U' : staged ? file.index : file.worktree}
                              </span>
                              <span>{file.path}</span>
                            </button>
                            <button
                              className="dg-stage"
                              disabled={!writable}
                              aria-label={`${staged ? '取消暂存' : '暂存'} ${file.path}`}
                              title={staged ? '取消暂存' : '暂存'}
                              onClick={() => {
                                void act(staged ? 'unstage' : 'stage', { path: file.path })
                              }}
                            >
                              {staged ? '−' : '+'}
                            </button>
                          </div>
                        ))}
                      </section>
                    )
                  })}
                  {!state.files.length && (
                    <div className="dg-empty">
                      工作区干净
                      <br />
                      <span className="dg-muted">所有变更均已提交</span>
                    </div>
                  )}
                </div>
              )}
              <div className="dg-diff">
                <div className="dg-diff-title">
                  <Icon name="changes" />
                  <span title={selectedPath}>{selectedPath || '文件差异'}</span>
                </div>
                <DiffContent text={diff} path={selectedPath} />
              </div>
            </div>
          ) : (
            <div className="dg-pr">
              <div className="dg-pr-heading">
                <Icon name="github" />
                <h2 ref={prHeading} tabIndex={-1}>
                  {pr ? 'Pull Request' : '创建 Pull Request'}
                </h2>
              </div>
              {prError && (
                <div className="dg-alert" role="alert">
                  {prError}
                </div>
              )}
              {pr ? (
                <div className="dg-pr-existing">
                  <span className="dg-muted">#{pr.number}</span>
                  <h3>{pr.title}</h3>
                  <a href={safeUrl(pr.url)} target="_blank" rel="noreferrer">
                    在 GitHub 中打开 ↗
                  </a>
                </div>
              ) : (
                <form
                  onSubmit={event => {
                    event.preventDefault()
                    void act('createPR', { title, body, base, draft })
                  }}
                >
                  <label>
                    目标分支
                    <input
                      required
                      value={base}
                      onChange={event => setBase(event.target.value)}
                      placeholder="main"
                    />
                  </label>
                  <label>
                    标题
                    <input
                      maxLength={256}
                      disabled={!!busy}
                      value={title}
                      onChange={event => setTitle(event.target.value)}
                      placeholder="留空由模型根据变更生成"
                    />
                  </label>
                  <label>
                    描述
                    <textarea
                      rows={3}
                      disabled={!!busy}
                      value={body}
                      onChange={event => setBody(event.target.value)}
                      placeholder="留空由当前会话模型根据提交和差异生成"
                    />
                  </label>
                  <div className="dg-form-footer">
                    <label className="dg-check">
                      <input
                        type="checkbox"
                        checked={draft}
                        onChange={event => setDraft(event.target.checked)}
                      />
                      创建为草稿
                    </label>
                    <button
                      className="dg-primary"
                      disabled={!canPush || !base.trim() || !!prError}
                      type="submit"
                    >
                      {busy === 'createPR'
                        ? !title.trim() || !body.trim()
                          ? '正在生成并创建…'
                          : '正在创建…'
                        : '创建 PR'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <footer className="dg-footer">
            <span className="dg-muted" role="status">
              {busy
                ? ['commit', 'commitPush'].includes(busy) && !message.trim()
                  ? '正在生成说明并提交…'
                  : '正在执行 Git 操作…'
                : state.writable === false
                  ? '只读工作区'
                  : state.files.length
                    ? `${state.files.length} 个变更文件`
                    : '没有待提交的变更'}
            </span>
            <button
              ref={commitTrigger}
              className="dg-primary"
              aria-expanded={commitOpen}
              aria-controls={commitId}
              disabled={!!busy}
              onClick={() => setCommitOpen(value => !value)}
            >
              <Icon name="commit" />
              提交与推送
              <Icon name="chevron" />
            </button>
          </footer>

          {commitOpen && (
            <CommitDialog
              commitDialog={commitDialog}
              commitId={commitId}
              messageInput={messageInput}
              state={state}
              branches={branches}
              branchPrefix={branchPrefix}
              newBranch={newBranch}
              hasChanges={hasChanges}
              message={message}
              include={include}
              busy={busy ?? null}
              writable={writable}
              canCommit={canCommit}
              canPush={canPush}
              pr={pr}
              onClose={closeCommit}
              onBranchPrefix={setBranchPrefix}
              onNewBranch={setNewBranch}
              onMessage={setMessage}
              onInclude={setInclude}
              onAct={(action, extra) => {
                void act(action, extra)
              }}
              onOpenPR={openPR}
            />
          )}
        </>
      )}
    </section>
  )
}
