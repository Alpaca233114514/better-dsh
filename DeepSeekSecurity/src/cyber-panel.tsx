import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  active,
  canRepair,
  findingStatuses,
  findingStatusLabels,
  type Finding,
  type SecurityRemote,
  type StartRequest,
} from './contracts.ts'
import { DashboardObserver, FindingsObserver } from './dashboard-state.ts'
import { CyberLoading } from './cyber-feedback.tsx'
import { CyberIcon } from './cyber-icons.tsx'
import { FindingFlow } from './cyber-flow.tsx'
import { FindingDetail, FindingsTable, ScanDetail } from './cyber-details.tsx'
import { NewScanDrawer } from './cyber-new-scan.tsx'
import {
  EmptyState,
  ScanStatus,
  formatCount,
  formatDate,
  formatDuration,
  repoName,
  severityNames,
  totalTokens,
  type RepositoryChoice,
} from './cyber-shared.tsx'

export { FindingFlow } from './cyber-flow.tsx'
export type { RepositoryChoice } from './cyber-shared.tsx'

type Page = 'findings' | 'repositories' | 'scans'

const navItems: { key: Page; label: string; icon: 'findings' | 'repo' | 'scan' }[] = [
  { key: 'findings', label: '安全发现', icon: 'findings' },
  { key: 'repositories', label: '仓库', icon: 'repo' },
  { key: 'scans', label: '扫描记录', icon: 'scan' },
]

export function CyberPanel({
  repositories,
  remote,
  sessionId,
  initialScanOpen = false,
  onRepository,
  onOpenConversation,
}: {
  repositories: RepositoryChoice[]
  remote: SecurityRemote
  sessionId: string
  initialScanOpen?: boolean
  onRepository: (id: string, newScan?: boolean) => void
  onOpenConversation: (id: string) => Promise<void>
}) {
  const [page, setPage] = useState<Page>('findings')
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState('all')
  const [finding, setFinding] = useState<Finding | null>(null)
  const [scan, setScan] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(initialScanOpen)
  const [repositoryDetail, setRepositoryDetail] = useState(false)
  const [navigationError, setNavigationError] = useState<string | null>(null)

  const localObserver = useMemo(() => new DashboardObserver(remote, sessionId), [remote, sessionId])
  const repositoryKey = repositories.map(repository => repository.sessionId).join('\0')
  const findingsObserver = useMemo(
    () =>
      new FindingsObserver(
        remote,
        repositories.map(repository => repository.sessionId),
        localObserver,
        sessionId,
      ),
    [remote, repositoryKey, localObserver, sessionId],
  )
  const localSnapshot = useSyncExternalStore(localObserver.subscribe, localObserver.getSnapshot)
  const globalSnapshot = useSyncExternalStore(findingsObserver.subscribe, findingsObserver.getSnapshot)

  useEffect(() => {
    localObserver.start()
    findingsObserver.start()
    return () => {
      localObserver.dispose()
      findingsObserver.dispose()
    }
  }, [localObserver, findingsObserver])

  const observer = page === 'findings' ? findingsObserver : localObserver
  const { data, error, loading, busy } = page === 'findings' ? globalSnapshot : localSnapshot
  const task =
    localSnapshot.data?.tasks.find(item => item.id === scan) ??
    globalSnapshot.data?.tasks.find(item => item.id === scan)
  const selectedFinding = globalSnapshot.data?.findings.find(item => item.id === finding?.id) ?? finding

  const normalizedQuery = query.toLocaleLowerCase()
  const filtered =
    data?.findings.filter(
      item =>
        (severity === 'all' || item.severity === severity) &&
        (status === 'all' || item.status === status) &&
        `${item.title} ${item.summary} ${item.locations.map(loc => loc.path).join(' ')}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
    ) ?? []

  const navigate = (next: Page) => {
    setPage(next)
    setQuery('')
    setFinding(null)
    setScan(null)
    setRepositoryDetail(false)
  }

  const start = async (options: Omit<StartRequest, 'sessionId'>) => {
    setNavigationError(null)
    const result = await localObserver.act('start', options, async startedTask => {
      if (!startedTask.conversationId) throw new Error('扫描记录未关联 DSH 会话，请检查宿主版本。')
      await onOpenConversation(startedTask.conversationId)
    })
    if (result) {
      navigate('scans')
      setDrawer(false)
    }
    return result
  }

  const navCount = (key: Page) =>
    key === 'findings'
      ? globalSnapshot.data?.findings.length ?? 0
      : key === 'scans'
        ? localSnapshot.data?.tasks.length ?? 0
        : repositories.length

  return (
    <div className="cy-app">
      <header className="cy-commandbar">
        <div className="cy-brand">
          <span>
            <CyberIcon size={22} />
          </span>
          <div>安全</div>
        </div>
        <nav className="cy-nav" aria-label="安全导航">
          {navItems.map(item => (
            <button
              key={item.key}
              aria-label={item.label}
              className={page === item.key ? 'cy-nav-item cy-selected' : 'cy-nav-item'}
              aria-current={page === item.key ? 'page' : undefined}
              onClick={() => navigate(item.key)}
            >
              <CyberIcon name={item.icon} />
              <span>{item.label}</span>
              <span className="cy-count">{navCount(item.key)}</span>
            </button>
          ))}
        </nav>
        <div className="cy-top-actions">
          <button
            className="cy-icon-button"
            title="刷新"
            aria-label="刷新工作台"
            disabled={busy}
            onClick={() => {
              void observer.refresh()
            }}
          >
            <CyberIcon name="refresh" />
          </button>
          {selectedFinding && canRepair(selectedFinding.status) ? (
            <button
              className="cy-primary"
              disabled={busy}
              onClick={() => {
                void findingsObserver.repairFinding(selectedFinding.id, onOpenConversation)
              }}
            >
              <CyberIcon name="repair" />
              {busy ? '正在处理…' : '交给 Agent 修复'}
            </button>
          ) : (
            <button className="cy-primary" disabled={!data || busy} onClick={() => setDrawer(true)}>
              <CyberIcon name="plus" />
              新建扫描
            </button>
          )}
        </div>
      </header>

      <main className="cy-main">
        {error && (
          <div className="cy-error cy-global-error" role="alert">
            <span>{error}</span>
            <button
              disabled={busy}
              onClick={() => {
                void observer.refresh(true)
              }}
            >
              重试加载
            </button>
          </div>
        )}
        {data?.warnings.map(warning => (
          <div className="cy-error cy-global-error" role="alert" key={warning}>
            {warning}
          </div>
        ))}
        {navigationError && (
          <div className="cy-error cy-global-error" role="alert">
            {navigationError}
          </div>
        )}
        {loading && <CyberLoading />}
        {data && (
          <div className="cy-content">
            {page !== 'findings' && (
              <label className="cy-repo-select">
                <CyberIcon name="repo" size={16} />
                <select
                  aria-label="选择仓库"
                  value={sessionId}
                  onChange={event => onRepository(event.target.value)}
                >
                  {repositories.map(repository => (
                    <option key={repository.sessionId} value={repository.sessionId}>
                      {repository.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {selectedFinding ? (
              <FindingDetail
                key={selectedFinding.id}
                finding={selectedFinding}
                task={globalSnapshot.data?.tasks.find(item => item.id === selectedFinding.taskId)}
                busy={busy}
                onStatus={nextStatus => {
                  void findingsObserver.setFindingStatus(selectedFinding.id, nextStatus)
                }}
                onBack={() => setFinding(null)}
                onScan={() => {
                  setScan(selectedFinding.taskId)
                  setFinding(null)
                }}
              />
            ) : task ? (
              <ScanDetail
                task={task}
                remote={remote}
                sessionId={findingsObserver.sessionForTask(task.id) ?? sessionId}
                findings={globalSnapshot.data?.findings ?? []}
                onBack={() => setScan(null)}
                onFinding={value => {
                  setFinding(value)
                  setPage('findings')
                }}
                busy={busy}
                onCancel={() => {
                  void localObserver.act('cancel')
                }}
                onOpenConversation={id => {
                  setNavigationError(null)
                  void onOpenConversation(id).catch(err =>
                    setNavigationError(err instanceof Error ? err.message : String(err)),
                  )
                }}
              />
            ) : page === 'findings' ? (
              <>
                <div className="cy-page-heading">
                  <div>
                    <h1>
                      安全发现<span className="cy-heading-count">{data.findings.length}</span>
                    </h1>
                  </div>
                </div>
                <div className="cy-toolbar">
                  <label className="cy-search">
                    <CyberIcon name="search" size={17} />
                    <input
                      aria-label="搜索漏洞"
                      placeholder="搜索安全发现…"
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                    />
                  </label>
                  <select
                    aria-label="严重程度筛选"
                    value={severity}
                    onChange={event => setSeverity(event.target.value)}
                  >
                    <option value="all">所有严重程度</option>
                    {Object.entries(severityNames).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="发现状态筛选"
                    value={status}
                    onChange={event => setStatus(event.target.value)}
                  >
                    <option value="all">所有状态</option>
                    {findingStatuses.map(value => (
                      <option key={value} value={value}>
                        {findingStatusLabels[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <FindingFlow findings={filtered} />
                {data.findings.length ? (
                  <FindingsTable tasks={data.tasks} findings={filtered} onSelect={setFinding} />
                ) : (
                  <EmptyState
                    title={data.tasks.some(active) ? '正在检查潜在漏洞' : '建立仓库的安全基线'}
                    onScan={() => setDrawer(true)}
                  />
                )}
              </>
            ) : page === 'scans' ? (
              <>
                <div className="cy-page-heading">
                  <div>
                    <h1>
                      扫描记录<span className="cy-heading-count">{data.tasks.length}</span>
                    </h1>
                  </div>
                </div>
                <div className="cy-toolbar">
                  <label className="cy-search">
                    <CyberIcon name="search" size={17} />
                    <input
                      aria-label="搜索扫描"
                      placeholder="搜索扫描记录…"
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                {data.tasks.length ? (
                  <div className="cy-table-wrap" role="region" aria-label="扫描记录列表" tabIndex={0}>
                    <table className="cy-table">
                      <thead>
                        <tr>
                          <th>开始时间</th>
                          <th>扫描</th>
                          <th>状态</th>
                          <th>发现</th>
                          <th>Token</th>
                          <th>耗时</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tasks
                          .filter(item =>
                            `${item.id} ${item.model} ${item.status} ${item.scope ?? '.'}`
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                          )
                          .map(item => (
                            <tr key={item.id}>
                              <td className="cy-muted cy-nowrap">{formatDate(item.startedAt)}</td>
                              <td>
                                <button className="cy-row-link" onClick={() => setScan(item.id)}>
                                  {repoName(item.workspace)}
                                </button>
                              </td>
                              <td>
                                <ScanStatus task={item} />
                              </td>
                              <td>{item.status === 'completed' ? item.findings : '—'}</td>
                              <td className="cy-nowrap">
                                {formatCount(totalTokens(item))}
                                {item.usage?.unreportedCalls ? ' +' : ''}
                              </td>
                              <td className="cy-nowrap cy-muted">{formatDuration(item)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="尚无扫描记录" onScan={() => setDrawer(true)} />
                )}
              </>
            ) : (
              <>
                <div className="cy-page-heading">
                  <div>
                    <h1>{repositoryDetail ? repoName(data.workspace) : '仓库'}</h1>
                  </div>
                </div>
                {repositoryDetail ? (
                  <>
                    <div className="cy-stats">
                      <div>
                        <strong>{data.tasks.length}</strong>
                        <span>扫描记录</span>
                      </div>
                      <div>
                        <strong>
                          {data.findings.filter(item => ['critical', 'high'].includes(item.severity)).length}
                        </strong>
                        <span>严重 / 高危</span>
                      </div>
                      <div>
                        <strong>{data.tasks[0] ? formatDate(data.tasks[0].startedAt) : '尚未扫描'}</strong>
                        <span>最近扫描</span>
                      </div>
                    </div>
                    <div className="cy-repo-callout">
                      <div>
                        <h2>持续建立安全基线</h2>
                      </div>
                      <button className="cy-primary" onClick={() => setDrawer(true)}>
                        新建扫描
                      </button>
                    </div>
                    <div className="cy-tabs">
                      <button onClick={() => navigate('findings')}>查看安全发现</button>
                      <button onClick={() => navigate('scans')}>查看扫描记录</button>
                      <button onClick={() => setRepositoryDetail(false)}>返回仓库列表</button>
                    </div>
                  </>
                ) : (
                  <div className="cy-table-wrap" role="region" aria-label="仓库列表" tabIndex={0}>
                    <table className="cy-table">
                      <thead>
                        <tr>
                          <th>仓库</th>
                          <th>来源</th>
                          <th>安全状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repositories.map(repository => (
                          <tr key={repository.path}>
                            <td>
                              <button
                                className="cy-row-link"
                                onClick={() => {
                                  if (repository.sessionId !== sessionId) onRepository(repository.sessionId)
                                  else setRepositoryDetail(true)
                                }}
                              >
                                {repository.name}
                              </button>
                            </td>
                            <td className="cy-muted">DSH 工作区</td>
                            <td>
                              {repository.sessionId === sessionId ? (
                                data.tasks[0] ? (
                                  <ScanStatus task={data.tasks[0]} />
                                ) : (
                                  <span className="cy-muted">尚未扫描</span>
                                )
                              ) : (
                                <span className="cy-muted">选择后查看</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {drawer && localSnapshot.data && (
        <NewScanDrawer
          data={localSnapshot.data}
          remote={remote}
          sessionId={sessionId}
          repositories={repositories}
          onRepository={onRepository}
          busy={busy}
          actionError={error}
          onClose={() => setDrawer(false)}
          onStart={start}
        />
      )}
    </div>
  )
}
