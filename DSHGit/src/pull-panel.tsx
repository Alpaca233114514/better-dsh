import { useEffect, useRef, useState } from 'react'
import { unwrap, type GitRemote, type Request, type Result } from './contracts.ts'
import { filesPerPage, type PullDetail, type PullSummary } from './pulls.ts'
import { DiffContent, Icon } from './panel.tsx'
import { usePullInbox, type Workspace } from './pull-inbox.ts'

type ReadAction = 'pullDetail' | 'pullFiles'
function usePullRead(remote: GitRemote, sessionId: string, action: ReadAction, revision: number, active: boolean, number?: number, page?: number) {
  const key = JSON.stringify([sessionId, action, revision, number, page])
  const [response, setResponse] = useState<{ key: string; value?: Result; error?: string }>()
  const previous = useRef(revision)
  useEffect(() => {
    if (!active) return
    let current = true
    const request: Request = { sessionId, action, number, page, refresh: previous.current !== revision }
    previous.current = revision
    remote.run(request).then(unwrap).then(value => { if (current) setResponse({ key, value }) })
      .catch(error => { if (current) setResponse({ key, error: String(error.message ?? error) }) })
    return () => { current = false }
  }, [remote, sessionId, action, revision, active, number, page, key])
  return response?.key === key ? response : undefined
}

const states = { OPEN: '已打开', MERGED: '已合并', CLOSED: '已关闭', DRAFT: '草稿' }
const kind = (pr: PullSummary) => pr.state === 'OPEN' && pr.isDraft ? 'DRAFT' : pr.state
const date = (value: string) => new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
const statuses: Record<string, string> = {
  SUCCESS: '通过', FAILURE: '失败', ERROR: '错误', CANCELLED: '已取消', SKIPPED: '已跳过', IN_PROGRESS: '运行中',
  QUEUED: '排队中', PENDING: '等待中', APPROVED: '已批准', CHANGES_REQUESTED: '请求修改', COMMENTED: '已评论',
}
function Stats({ additions, deletions }: { additions: number; deletions: number }) {
  return <span className="dg-stats"><b>+{additions.toLocaleString()}</b><em>−{deletions.toLocaleString()}</em></span>
}
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part)
    return link ? <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : part
  })}</>
}
function Description({ body }: { body: string }) {
  return <div className="dg-pr-prose">{(body.trim() || '尚未填写说明。').split(/\r?\n\s*\n/).map((block, i) =>
    <div key={i}>{block.split(/\r?\n/).map((line, j) => {
      if (/^#{1,6}\s/.test(line)) return <h3 key={j}>{line.replace(/^#+\s+/, '')}</h3>
      if (/^[-*]\s/.test(line)) return <div className="dg-pr-bullet" key={j}><Inline text={line.slice(2)}/></div>
      return <div key={j}><Inline text={line}/></div>
    })}</div>)}</div>
}
function Heading({ pr, repository }: { pr: PullDetail; repository: string }) {
  return <header className="dg-review-heading"><div className="dg-pr-kicker"><span data-kind={kind(pr)}><Icon name="pr"/>{states[kind(pr)]}</span>
    <b title={repository}>{repository.split('/').at(-1)} #{pr.number}</b></div>
    <h2>{pr.title}</h2><div className="dg-pr-byline"><span className="dg-pr-avatar">{pr.author?.login[0].toUpperCase() ?? '?'}</span>
      <strong>{pr.author?.login ?? '未知用户'}</strong><time dateTime={pr.updatedAt}>{date(pr.updatedAt)}</time><i>·</i>
      <span className="dg-pr-refs"><span title={pr.headRefName}>{pr.headRefName}</span> → <span title={pr.baseRefName}>{pr.baseRefName}</span></span>
    </div></header>
}
function Summary({ pr, repository }: { pr: PullDetail; repository: string }) {
  const reviews = pr.latestReviews.map(r => ({ who: r.author?.login ?? '未知用户', state: statuses[r.state] ?? r.state }))
  const requested = pr.reviewRequests.map(r => ({ who: r.login ?? r.name ?? '审查者', state: '待审查' }))
  const activity = [
    ...pr.comments.map(c => ({ title: c.author?.login ?? '未知用户', text: c.body, at: c.createdAt, sha: '' })),
    ...pr.commits.map(c => ({ title: c.messageHeadline, text: '', at: c.committedDate, sha: c.oid.slice(0, 7) })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return <div className="dg-pr-columns"><article>
    <Heading pr={pr} repository={repository}/><Description body={pr.body}/>
    <section className="dg-pr-activity"><h3>活动 <small>{activity.length}</small></h3>
      {activity.length === 0 && <p className="dg-muted">暂无活动</p>}
      {activity.map((item, i) => <div className="dg-pr-event" key={i}><div className="dg-pr-event-head">
        {item.sha ? <Icon name="commit"/> : <span className="dg-pr-avatar">{item.title[0].toUpperCase()}</span>}
        <strong>{item.title}</strong><small>{item.sha && <code>{item.sha}</code>} {date(item.at)}</small></div>
        {item.text && <Description body={item.text}/>}</div>)}
    </section></article><aside className="dg-pr-facts">
    <section><h3>讨论</h3><div className="dg-pr-fact"><span className="dg-pr-talk" aria-hidden="true">◌</span><span>{pr.comments.length ? `${pr.comments.length} 条评论` : '暂无评论'}</span></div></section>
    <section><h3>审查者</h3>{[...requested, ...reviews].map((r, i) => <div className="dg-pr-fact" key={i}><span className="dg-pr-avatar">{r.who[0].toUpperCase()}</span><span>{r.who}</span><small>{r.state}</small></div>)}
      {!requested.length && !reviews.length && <p>暂无审查者</p>}</section>
    <section><h3>检查</h3>{pr.statusCheckRollup?.map((check, i) => {
      const status = check.conclusion || check.state || check.status || 'PENDING'
      return <div className="dg-pr-fact" key={i}><span className="dg-pr-check" data-status={status}>{status === 'SUCCESS' ? '✓' : ['FAILURE', 'ERROR'].includes(status) ? '×' : '·'}</span><span>{check.name || check.context}</span><small>{statuses[status] ?? status}</small></div>
    })}{!pr.statusCheckRollup?.length && <p>{pr.statusCheckRollup === undefined ? '无法读取检查状态' : '暂无检查'}</p>}</section>
  </aside></div>
}
function FileChanges({ pr, remote, sessionId, revision, active }: { pr: PullDetail; remote: GitRemote; sessionId: string; revision: number; active: boolean }) {
  const [page, setPage] = useState(1)
  const response = usePullRead(remote, sessionId, 'pullFiles', revision, active, pr.number, page)
  const files = response?.value?.pullFiles
  return <section className="dg-pr-files"><h3>更改的文件 <small>{pr.changedFiles}</small></h3>
    {response?.error && <p role="alert">{response.error}</p>}
    {!response && <p role="status">正在读取文件差异…</p>}
    {files?.map((file, i) => <details key={file.filename} open={i === 0}><summary><Icon name="changes"/><span>{file.filename}</span><Stats {...file}/></summary>
      {file.patch ? <div className="dg-diff"><DiffContent path={file.filename} text={file.patch}/></div> : <p>GitHub 未提供此文件的文本差异。</p>}</details>)}
    {files?.length === 0 && <p>没有文件更改</p>}
    {pr.changedFiles > filesPerPage && <div className="dg-pr-pages"><button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button>
      <span>第 {page} 页</span><button disabled={page * filesPerPage >= Math.min(3000, pr.changedFiles)} onClick={() => setPage(page + 1)}>下一页</button></div>}
  </section>
}
export function PullPanel({ remote, workspaces, demo = false }: { remote: GitRemote; workspaces: Workspace[]; demo?: boolean }) {
  const [revision, setRevision] = useState(0), [query, setQuery] = useState('')
  const [url, setUrl] = useState<string>(), [section, setSection] = useState<'summary' | 'changes'>('summary')
  const [showList, setShowList] = useState(true)
  const { pulls, errors, done, total } = usePullInbox(remote, workspaces, revision)
  const loading = done < total
  const matches = pulls.filter(p => [p.repository, p.title, p.author?.login, '#' + p.number, p.url].some(s => s?.toLowerCase().includes(query.toLowerCase().trim())))
  const selected = matches.find(p => p.url === url) ?? matches.find(p => kind(p) === 'OPEN') ?? matches[0]
  const sessionId = selected?.sessionId ?? '', repository = selected?.repository
  const detail = usePullRead(remote, sessionId, 'pullDetail', revision, !!selected, selected?.number)
  const pr = detail?.value?.pull
  function select(id: string) { setUrl(id); setSection('summary'); setShowList(false) }
  return <div className="dshgit dg-review" data-list={showList}>
    <nav className="dg-pr-inbox" aria-label="拉取请求列表"><header><h2>拉取请求</h2><button aria-label="刷新拉取请求" disabled={loading} onClick={() => setRevision(r => r + 1)}><Icon name="refresh"/></button></header>
      <label className="dg-pr-search"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 5 5"/></svg><input type="search" aria-label="搜索拉取请求" placeholder="搜索或粘贴 PR 链接" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <div className="dg-pr-list">{loading && <div className="dg-pr-progress" role="status"><progress value={done} max={total}/>正在读取 Git 仓库与 PR · {done}/{total}</div>}
      {errors.length > 0 && <details className="dg-pr-errors"><summary>{errors.length} 个工作区读取失败</summary>{errors.map(e => <p key={e}>{e}</p>)}</details>}
      {(['OPEN', 'DRAFT', 'MERGED', 'CLOSED'] as const).map(state => {
        const group = matches.filter(p => kind(p) === state)
        return group.length > 0 && <section key={state}><h3>{states[state]} <small>{group.length}</small></h3>{group.map(p =>
          <button className="dg-pr-item" key={p.url} aria-current={p.url === selected?.url} onClick={() => select(p.url)}>
            <strong title={p.title}>{p.title}</strong><small><span className="dg-pr-avatar">{p.author?.login[0].toUpperCase() ?? '?'}</span><span title={p.repository}>{p.repository.split('/').at(-1)} #{p.number}</span><time dateTime={p.updatedAt}>{date(p.updatedAt)}</time></small>
          </button>)}</section>
      })}
      {!loading && !matches.length && <p className="dg-muted">{query ? '没有匹配的拉取请求' : errors.length ? '暂无可显示的拉取请求' : '工作区暂无拉取请求'}</p>}
      </div></nav>
    <main className="dg-pr-reader"><div className="dg-pr-bar"><button className="dg-pr-back" onClick={() => setShowList(!showList)}>{showList ? '返回详情' : '☰ 请求列表'}</button>
      <div className="dg-pr-segments">{(['summary', 'changes'] as const).map(tab => <button key={tab} aria-pressed={section === tab} onClick={() => setSection(tab)}>
        {tab === 'summary' ? '摘要' : '更改'}{tab === 'changes' && pr && <Stats {...pr}/>}</button>)}</div>
      {pr && !demo && /^https:\/\/github\.com\//.test(pr.url) && <a href={pr.url} target="_blank" rel="noreferrer"><Icon name="github"/> GitHub ↗</a>}
    </div>
    {detail?.error ? <div className="dg-pr-empty" role="alert"><p>{detail.error}</p><button onClick={() => setRevision(r => r + 1)}>重试</button></div>
      : (loading && !selected) || (selected && !pr) ? <p className="dg-pr-empty" role="status">{selected ? '正在读取 PR 详情…' : '正在读取 Git 仓库与拉取请求…'}</p>
      : !selected || !pr ? <div className="dg-pr-empty"><Icon name="pr"/><p>{query ? '没有匹配的拉取请求' : errors.length ? '暂无可显示的拉取请求，请查看工作区读取结果。' : '工作区暂无拉取请求'}</p>{query && <button onClick={() => setQuery('')}>清除搜索</button>}</div>
      : <div className="dg-pr-scroll" key={pr.url}>
        {section === 'summary' ? <Summary pr={pr} repository={repository!}/> : <><Heading pr={pr} repository={repository!}/><FileChanges pr={pr} remote={remote} sessionId={sessionId} revision={revision} active/></>}
      </div>}
    </main></div>
}
