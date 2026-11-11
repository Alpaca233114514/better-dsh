import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { active, detailsSchema, modelsSchema, findingStatuses, findingStatusLabels, canRepair, type FindingStatus, type Dashboard, type Details, type Finding, type Models, type SecurityRemote, type StartRequest, type Task } from './contracts.ts'
import { DashboardObserver } from './dashboard-state.ts'
import { projectFindings } from './dashboard.ts'
import { phaseLabels } from './progress.ts'
import { CyberIcon } from './cyber-icons.tsx'
import { CyberLoading } from './cyber-feedback.tsx'

type Page = 'findings' | 'repositories' | 'scans'
export type RepositoryChoice = { sessionId: string; path: string; name: string }
const severityNames = { critical: '严重', high: '高危', medium: '中危', low: '低危', info: '提示', unknown: '未评级' }
const statusNames = { starting: '准备中', running: '扫描中', cancelling: '正在停止', completed: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' }
const effortNames: Record<string, string> = { off: '关闭', none: '关闭', minimal: '最低', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高', ultra: '超高' }
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
const nameOf = (value: string) => value.split(/[\\/]/).filter(Boolean).at(-1) ?? value
const tokens = (task: Task) => task.usage?.calls ? task.usage.inputTokens + task.usage.outputTokens + task.usage.cacheReadTokens + task.usage.cacheWriteTokens : null
const number = (value: number | null) => value == null ? '未报告' : value.toLocaleString('zh-CN')
const duration = (task: Task) => {
  const seconds = Math.max(0, Math.floor(((active(task) ? Date.now() : Date.parse(task.updatedAt)) - Date.parse(task.startedAt)) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

function Badge({ severity }: { severity: Finding['severity'] }) { return <span className={`cy-badge cy-${severity}`}>{severityNames[severity]}</span> }
function Status({ task }: { task: Task }) { return <span className={`cy-status cy-status-${task.status}`}><span />{statusNames[task.status]}</span> }
function Empty({ title, onScan }: { title: string; onScan?: () => void }) {
  return <div className="cy-empty"><span className="cy-empty-icon"><CyberIcon size={27} /></span><h2>{title}</h2>{onScan && <button className="cy-primary" onClick={onScan}><CyberIcon name="plus" />新建扫描</button>}</div>
}

export function FindingFlow({ findings }: { findings: Finding[] }) {
  const groups = Object.keys(severityNames).map(key => ({ severity: key as Finding['severity'], count: findings.filter(f => f.severity === key).length })).filter(group => group.count)
  if (!findings.length) return null
  const recurring = findings.filter(f => f.occurrences > 1).length
  const severityOrder = Object.keys(severityNames)
  const statuses = findingStatuses.map(status => {
    const matching = findings.filter(finding => finding.status === status)
    return { status, count: matching.length, rank: matching.reduce((sum, finding) => sum + severityOrder.indexOf(finding.severity), 0) / (matching.length || 1) }
  }).filter(group => group.count).sort((a, b) => a.rank - b.rank)
  const height = Math.max(160, Math.max(groups.length, statuses.length) * 64 + 24)
  const position = (index: number, count: number) => count === 1 ? height / 2 : 32 + index * ((height - 64) / (count - 1))
  const scale = 36 / findings.length
  let left = height / 2 - (36 + (groups.length - 1) * 6) / 2
  const nodes = groups.map((group, index) => {
    const y = position(index, groups.length)
    const width = group.count * scale
    const origin = left + width / 2
    left += width + 6
    return { ...group, y, width, origin }
  })
  const targets = statuses.map((group, index) => ({ ...group, y: position(index, statuses.length), offset: -group.count * scale / 2 }))
  const links = nodes.flatMap(node => {
    let offset = -node.width / 2
    return targets.flatMap(target => {
      const count = findings.filter(finding => finding.severity === node.severity && finding.status === target.status).length
      if (!count) return []
      const width = count * scale
      const from = node.y + offset + width / 2, to = target.y + target.offset + width / 2
      offset += width; target.offset += width
      return [{ key: `${node.severity}-${target.status}`, severity: node.severity, from, to, width }]
    })
  })
  return <div className="cy-flow"><div className="cy-flow-diagram" style={{ height }} role="img" aria-label={`共 ${findings.length} 项发现，${recurring} 项跨扫描再次发现`}>
    <div className="cy-flow-label cy-flow-source"><span>安全发现</span><strong>{findings.length}</strong></div>
    <svg viewBox={`0 0 400 ${height}`} preserveAspectRatio="none" aria-hidden="true">{nodes.map(node => <path key={node.severity} d={`M0 ${node.origin} C150 ${node.origin}, 250 ${node.y}, 400 ${node.y}`} strokeWidth={Math.max(1, node.width)} className={`cy-flow-link cy-flow-${node.severity}`} />)}</svg>
    <div className="cy-flow-middle">{nodes.map(node => <div key={node.severity} className={`cy-flow-label cy-flow-severity cy-flow-${node.severity}`} style={{ top: node.y }}><span>{severityNames[node.severity]}</span><strong>{node.count}</strong></div>)}</div>
    <svg viewBox={`0 0 400 ${height}`} preserveAspectRatio="none" aria-hidden="true">{links.map(link => <path key={link.key} d={`M0 ${link.from} C150 ${link.from}, 250 ${link.to}, 400 ${link.to}`} strokeWidth={Math.max(1, link.width)} className={`cy-flow-link cy-flow-${link.severity}`} />)}</svg>
    <div className="cy-flow-statuses">{targets.map(target => <div key={target.status} className={`cy-flow-label cy-flow-target cy-finding-${target.status}`} style={{ top: target.y }}><span>{findingStatusLabels[target.status]}</span><strong>{target.count}</strong></div>)}</div>
  </div><div className="cy-flow-compact">{groups.map(group => <span key={group.severity}><Badge severity={group.severity} />{group.count}</span>)}{statuses.map(group => <span key={group.status}>{findingStatusLabels[group.status]} {group.count}</span>)}</div></div>
}

function FindingsTable({ findings, onSelect }: { findings: Finding[]; onSelect: (finding: Finding) => void }) {
  return <div className="cy-table-wrap"><table className="cy-table"><thead><tr><th>严重程度</th><th>发现</th><th>状态</th><th>最近发现</th></tr></thead><tbody>
    {findings.map(finding => <tr key={finding.id}><td><Badge severity={finding.severity} /></td><td><button className="cy-row-link" onClick={() => onSelect(finding)}>{finding.title}</button></td><td><span className={`cy-badge cy-finding-${finding.status}`}>{findingStatusLabels[finding.status]}</span></td><td className="cy-nowrap cy-muted">{date(finding.lastSeen)}</td></tr>)}
  </tbody></table>{!findings.length && <div className="cy-no-match">没有匹配的发现</div>}</div>
}

function FindingDetail({ finding, task, onBack, onScan, onStatus, busy }: { finding: Finding; task?: Task; onBack: () => void; onScan: () => void; onStatus: (status: FindingStatus) => void; busy: boolean }) {
  const [tab, setTab] = useState<'report' | 'fix'>('report')
  const id = useId()
  return <><div className="cy-breadcrumb"><button onClick={onBack}>安全发现</button><span>/</span><span>{finding.title}</span></div><div className="cy-detail-grid"><article>
    <h1>{finding.title}</h1>
    <TabList id={id} label="发现详情" selected={tab} options={[['report', '报告'], ['fix', '修复建议']]} onSelect={setTab} />
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>{tab === 'report' ? <><ReportSection title="摘要" text={finding.summary} /><ReportSection title="代码位置" text={finding.locations.map(location => `${location.path}${location.startLine ? `:${location.startLine}${location.endLine ? `–${location.endLine}` : ''}` : ''}`).join('\n')} /><ReportSection title="证据" text={finding.evidence || '报告未附加独立代码证据。'} /><ReportSection title="验证记录" text={finding.validation || '未提供验证记录；当前结论来自静态源码审计。'} /><ReportSection title="攻击路径" text={finding.attackPath || '未提供单独的攻击路径记录。'} /></>
      : <ReportSection title="修复建议" text={finding.remediation || '报告未提供修复建议。'} />}</div>
  </article><aside className="cy-metadata"><Meta label="严重程度"><Badge severity={finding.severity} /></Meta><Meta label="状态"><select aria-label="处置状态" value={finding.status} disabled={busy} onChange={event => onStatus(event.target.value as FindingStatus)}>{findingStatuses.map(status => <option key={status} value={status}>{findingStatusLabels[status]}</option>)}</select></Meta><Meta label="仓库">{task ? nameOf(task.workspace) : '—'}</Meta><Meta label="首次发现">{date(finding.firstSeen)}</Meta><Meta label="出现次数">{finding.occurrences} 次扫描</Meta><Meta label="模型">{task?.model ?? '—'}</Meta><button onClick={onScan}>查看来源扫描<CyberIcon name="chevron" size={14} /></button></aside></div></>
}
function Meta({ label, children }: { label: string; children: React.ReactNode }) { return <div className="cy-meta"><div>{label}</div><section>{children}</section></div> }
function ReportSection({ title, text }: { title: string; text: string }) { return <section className="cy-report-section"><h3>{title}</h3><div className="cy-prose">{text}</div></section> }

function TabList<T extends string>({ id, label, selected, options, onSelect }: { id: string; label: string; selected: T; options: [T, string][]; onSelect: (key: T) => void }) {
  return <div className="cy-tabs" role="tablist" aria-label={label} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = options.findIndex(([key]) => key === selected)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
    onSelect(options[next][0])
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next].focus()
  }}>{options.map(([key, title]) => <button key={key} role="tab" id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={selected === key} tabIndex={selected === key ? 0 : -1} onClick={() => onSelect(key)}>{title}</button>)}</div>
}

function ScanDetail({ task, remote, sessionId, onBack, onFinding, busy, onCancel, onOpenConversation, findings }: { task: Task; remote: SecurityRemote; sessionId: string; onBack: () => void; onFinding: (finding: Finding) => void; busy: boolean; onCancel: () => void; onOpenConversation: (id: string) => void; findings: Finding[] }) {
  const id = useId()
  const [tab, setTab] = useState<'findings' | 'outputs' | 'timeline'>('findings')
  const [result, setResult] = useState<{ id: string; details?: Details; error?: string } | null>(null)
  useEffect(() => {
    let live = true
    if (task.status === 'completed') void remote.details({ sessionId, taskId: task.id }).then(value => {
      if (!live) return
      if (!value.ok) throw new Error(value.error.message)
      setResult({ id: task.id, details: detailsSchema.parse(value.value) })
    }).catch(error => { if (live) setResult({ id: task.id, error: String(error) }) })
    return () => { live = false }
  }, [remote, sessionId, task.id, task.status])
  const details = result?.id === task.id ? result.details : undefined
  const projection = useMemo(() => {
    try { return { findings: details ? projectFindings([{ task, details }]).map(finding => ({ ...finding, status: findings.find(current => current.id === finding.id)?.status ?? finding.status })) : [], error: null } }
    catch (error) { return { findings: [], error: String(error) } }
  }, [task, details, findings])
  return <><div className="cy-breadcrumb"><button onClick={onBack}>扫描记录</button><span>/</span><span>扫描 {task.id.slice(0, 8)}</span></div><div className="cy-detail-grid"><article>
    <div className="cy-scan-heading"><h1>标准扫描 · {nameOf(task.workspace)}</h1>{active(task) && <button disabled={busy || task.status === 'cancelling'} onClick={onCancel}>停止扫描</button>}</div><div className="cy-scan-subtitle"><Status task={task} /><span>{date(task.startedAt)} · {duration(task)}</span></div>
    <TabList id={id} label="扫描详情" selected={tab} options={[['findings', '安全发现'], ['outputs', '输出文件'], ['timeline', '执行时间线']]} onSelect={setTab} />
    {task.error && <div className="cy-error" role="alert">{task.error}</div>}
    {result?.id === task.id && result.error && <div className="cy-error" role="alert">{result.error}</div>}
    {projection.error && <div className="cy-error" role="alert">{projection.error}</div>}
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
    {tab === 'findings' && <>{task.status === 'completed' ? details ? <FindingsTable findings={projection.findings} onSelect={onFinding} /> : <div className="cy-no-match">{result?.error ? '报告不可用' : '正在读取报告…'}</div> : <Empty title={active(task) ? phaseLabels[task.phase] : '扫描尚未完成'} />}</>}
    {tab === 'outputs' && <>{details ? <><div className="cy-output-actions"><button onClick={() => download(`security-${task.id.slice(0, 8)}.md`, details.report)}>导出报告</button><button onClick={() => download(`findings-${task.id.slice(0, 8)}.json`, details.findings)}>导出 JSON</button></div><ReportSection title="报告" text={details.report} />{details.threatModel && <ReportSection title="威胁模型" text={details.threatModel} />}</> : <div className="cy-no-match">完成后显示报告和威胁模型</div>}</>}
    {tab === 'timeline' && <ol className="cy-timeline">{(task.timeline ?? [{ phase: task.phase, at: task.updatedAt }]).map((event, index) => <li key={`${event.at}-${index}`}><span className="cy-timeline-dot" /><div><strong>{phaseLabels[event.phase]}</strong><time>{date(event.at)}</time></div></li>)}{!active(task) && <li><span className="cy-timeline-dot" /><div><strong>{statusNames[task.status]}</strong><time>{date(task.updatedAt)}</time></div></li>}</ol>}
    </div>
  </article><aside className="cy-metadata"><Meta label="仓库">{nameOf(task.workspace)}</Meta><Meta label="范围">{task.scope ?? '.'}</Meta><Meta label="模型">{task.model}</Meta><Meta label="Token 用量">{number(tokens(task))}{task.usage?.unreportedCalls ? ' +' : ''}</Meta><Meta label="来源">DSH · 本地静态审计</Meta><Meta label="附加需求">{task.instructions || '标准安全审计'}</Meta><Meta label="扫描编号">{task.scanId ?? '尚未注册'}</Meta>{task.conversationId && <button onClick={() => onOpenConversation(task.conversationId!)}>打开扫描会话<CyberIcon name="chevron" size={14} /></button>}</aside></div></>
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: filename.endsWith('.json') ? 'application/json' : 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function NewScan({ data, remote, sessionId, repositories, onRepository, busy, actionError, onClose, onStart }: { data: Dashboard; remote: SecurityRemote; sessionId: string; repositories: RepositoryChoice[]; onRepository: (id: string, newScan?: boolean) => void; busy: boolean; actionError: string | null; onClose: () => void; onStart: (options: Omit<StartRequest, 'sessionId'>) => Promise<boolean> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [scopeMode, setScopeMode] = useState('full')
  const [scope, setScope] = useState('')
  const [instructions, setInstructions] = useState('')
  const [models, setModels] = useState<Models>([])
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState(JSON.stringify([data.selection?.provider ?? '', data.selection?.model ?? '']))
  const [effort, setEffort] = useState(data.selection?.ultra ? 'ultra' : data.selection?.reasoningEffort ?? '')
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    element.showModal()
    return () => { element.close(); previous?.focus() }
  }, [])
  useEffect(() => {
    let live = true
    void remote.models({ sessionId }).then(result => {
      if (!live) return
      if (!result.ok) throw new Error(result.error.message)
      setModels(modelsSchema.parse(result.value))
    }).catch(error => { if (live) setError(`模型列表读取失败：${String(error)}`) })
    return () => { live = false }
  }, [remote, sessionId])
  const [provider, model] = JSON.parse(route) as [string, string]
  const options = [...models]
  if (data.selection && !options.some(item => item.provider === data.selection!.provider && item.model === data.selection!.model)) {
    options.unshift({ ...data.selection, label: data.selection.model, efforts: data.selection.reasoningEffort ? [data.selection.reasoningEffort] : [] })
  }
  const selectedModel = options.find(item => item.provider === provider && item.model === model)
  const efforts = selectedModel?.efforts.filter(value => value !== 'ultra') ?? []
  return <dialog ref={dialog} className="cy-drawer" aria-labelledby="cy-new-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={event => { event.preventDefault(); setError(null); void onStart({ provider, model, reasoningEffort: effort === 'ultra' ? 'max' : effort, ...(effort === 'ultra' ? { ultra: true } : {}), scope: scopeMode === 'full' ? '.' : scope, instructions: instructions.trim() || undefined }).then(success => { if (success) onClose() }) }}>
      <header><div><h2 id="cy-new-title">新建扫描</h2></div><button type="button" className="cy-icon-button" aria-label="关闭新建扫描" disabled={busy} onClick={onClose}><CyberIcon name="close" /></button></header>
      <div className="cy-drawer-body"><label className="cy-field">仓库<select aria-label="仓库" disabled={busy} value={sessionId} onChange={event => onRepository(event.target.value, true)}>{repositories.map(repository => <option key={repository.sessionId} value={repository.sessionId}>{repository.path}</option>)}</select></label>
        <fieldset><legend>扫描方式</legend><label className="cy-radio"><input type="radio" checked readOnly /><span>仓库扫描</span></label></fieldset>
        <fieldset><legend>扫描范围</legend><label className="cy-radio"><input type="radio" name="scope" checked={scopeMode === 'full'} onChange={() => setScopeMode('full')} /><span>整个工作区</span></label><label className="cy-radio"><input type="radio" name="scope" checked={scopeMode === 'path'} onChange={() => setScopeMode('path')} /><span>指定目录或文件</span></label>{scopeMode === 'path' && <label className="cy-field">相对路径<input autoFocus required maxLength={2000} placeholder="例如 src/auth" value={scope} onChange={event => setScope(event.target.value)} /></label>}</fieldset>
        <label className="cy-field">模型<select aria-label="模型" required value={route} onChange={event => { setRoute(event.target.value); setEffort('') }}><option value={JSON.stringify(['', ''])} disabled>选择模型</option>{options.map(item => <option key={JSON.stringify([item.provider, item.model])} value={JSON.stringify([item.provider, item.model])}>{item.label} · {item.provider}</option>)}</select></label>
        <label className="cy-field">推理强度<select aria-label="推理强度" value={effort} onChange={event => setEffort(event.target.value)}><option value="">模型默认</option>{efforts.map(value => <option key={value} value={value}>{effortNames[value] ?? value}</option>)}{selectedModel?.ultra && <option value="ultra">Ultra</option>}</select></label>
        <label className="cy-field">附加需求<textarea rows={4} maxLength={12000} placeholder="关注的攻击面、排除项或审计背景…" value={instructions} onChange={event => setInstructions(event.target.value)} /></label>
        {(error || actionError) && <div className="cy-error" role="alert">{error || actionError}</div>}
      </div><footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="cy-primary" type="submit" disabled={busy || !provider || !model || active(data.tasks[0] ?? null)}>{busy ? '正在启动…' : active(data.tasks[0] ?? null) ? '已有扫描运行中' : '开始扫描'}</button></footer>
    </form>
  </dialog>
}

export function CyberPanel({ repositories, remote, sessionId, initialScanOpen = false, onRepository, onOpenConversation }: { repositories: RepositoryChoice[]; remote: SecurityRemote; sessionId: string; initialScanOpen?: boolean; onRepository: (id: string, newScan?: boolean) => void; onOpenConversation: (id: string) => Promise<void> }) {
  const observer = useMemo(() => new DashboardObserver(remote, sessionId), [remote, sessionId])
  const { data, error, loading, busy } = useSyncExternalStore(observer.subscribe, observer.getSnapshot)
  useEffect(() => { observer.start(); return () => observer.dispose() }, [observer])
  const [page, setPage] = useState<Page>('findings')
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState('all')
  const [finding, setFinding] = useState<Finding | null>(null)
  const [scan, setScan] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(initialScanOpen)
  const [repositoryDetail, setRepositoryDetail] = useState(false)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const task = data?.tasks.find(item => item.id === scan)
  const selectedFinding = data?.findings.find(item => item.id === finding?.id) ?? finding
  const filtered = data?.findings.filter(item => (severity === 'all' || item.severity === severity) && (status === 'all' || item.status === status) && `${item.title} ${item.summary} ${item.locations.map(location => location.path).join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? []
  const navigate = (next: Page) => { setPage(next); setQuery(''); setFinding(null); setScan(null); setRepositoryDetail(false) }
  const start = async (options: Omit<StartRequest, 'sessionId'>) => {
    setNavigationError(null)
    const result = await observer.act('start', options, async task => {
      if (!task.conversationId) throw new Error('扫描记录未关联 DSH 会话，请检查宿主版本。')
      await onOpenConversation(task.conversationId)
    })
    if (result) { navigate('scans'); setDrawer(false) }
    return result
  }
  return <div className="cy-app"><nav className="cy-nav" aria-label="Cyber 安全导航"><div className="cy-brand"><span><CyberIcon size={22} /></span><div>安全</div></div>
    {(['findings', 'repositories', 'scans'] as const).map(key => <button key={key} aria-label={key === 'repositories' ? '仓库' : key === 'scans' ? '扫描记录' : '安全发现'} className={page === key ? 'cy-nav-item cy-selected' : 'cy-nav-item'} aria-current={page === key ? 'page' : undefined} onClick={() => navigate(key)}><CyberIcon name={key === 'repositories' ? 'repo' : key === 'scans' ? 'scan' : 'findings'} /><span>{key === 'repositories' ? '仓库' : key === 'scans' ? '扫描记录' : '安全发现'}</span><span className="cy-count">{key === 'findings' ? data?.findings.length ?? 0 : key === 'scans' ? data?.tasks.length ?? 0 : repositories.length}</span></button>)}
    </nav>
    <main className="cy-main"><div className="cy-topbar"><label className="cy-repo-select"><CyberIcon name="repo" size={16} /><select aria-label="选择仓库" value={sessionId} onChange={event => onRepository(event.target.value)}>{repositories.map(repository => <option key={repository.sessionId} value={repository.sessionId}>{repository.name}</option>)}</select></label><span className="cy-divider">/</span><strong>{page === 'repositories' ? '仓库' : page === 'scans' ? '扫描记录' : '安全发现'}</strong><div className="cy-top-actions"><button className="cy-icon-button" title="刷新" aria-label="刷新工作台" disabled={busy} onClick={() => { void observer.refresh() }}><CyberIcon name="refresh" /></button>{selectedFinding && canRepair(selectedFinding.status) ? <button className="cy-primary" disabled={busy} onClick={() => { void observer.repairFinding(selectedFinding.id, onOpenConversation) }}><CyberIcon name="repair" />{busy ? '正在处理…' : '修复'}</button> : <button className="cy-primary" disabled={!data || busy} onClick={() => setDrawer(true)}><CyberIcon name="plus" />新建扫描</button>}</div></div>
      {error && <div className="cy-error cy-global-error" role="alert"><span>{error}</span><button disabled={busy} onClick={() => { void observer.refresh(true) }}>重试加载</button></div>}{data?.warnings.map(warning => <div className="cy-error cy-global-error" role="alert" key={warning}>{warning}</div>)}
      {navigationError && <div className="cy-error cy-global-error" role="alert">{navigationError}</div>}
      {loading && <CyberLoading />}
      {data && <div className="cy-content">
        {selectedFinding ? <FindingDetail key={selectedFinding.id} finding={selectedFinding} task={data.tasks.find(item => item.id === selectedFinding.taskId)} busy={busy} onStatus={status => { void observer.setFindingStatus(selectedFinding.id, status) }} onBack={() => setFinding(null)} onScan={() => { setScan(selectedFinding.taskId); setFinding(null); setPage('scans') }} />
          : task ? <ScanDetail task={task} remote={remote} sessionId={sessionId} findings={data.findings} onBack={() => setScan(null)} onFinding={setFinding} busy={busy} onCancel={() => { void observer.act('cancel') }} onOpenConversation={id => { setNavigationError(null); void onOpenConversation(id).catch(error => setNavigationError(error instanceof Error ? error.message : String(error))) }} />
          : page === 'findings' ? <><div className="cy-page-heading"><div><h1>安全发现<span className="cy-heading-count">{data.findings.length}</span></h1></div></div>
            <div className="cy-toolbar"><label className="cy-search"><CyberIcon name="search" size={17} /><input aria-label="搜索漏洞" placeholder="搜索安全发现…" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="严重程度筛选" value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">所有严重程度</option>{Object.entries(severityNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="发现状态筛选" value={status} onChange={event => setStatus(event.target.value)}><option value="all">所有状态</option>{findingStatuses.map(value => <option key={value} value={value}>{findingStatusLabels[value]}</option>)}</select></div>
            <FindingFlow findings={filtered} />{data.findings.length ? <FindingsTable findings={filtered} onSelect={setFinding} /> : <Empty title={data.tasks.some(active) ? '正在检查潜在漏洞' : '建立仓库的安全基线'} onScan={() => setDrawer(true)} />}</>
            : page === 'scans' ? <><div className="cy-page-heading"><div><h1>扫描记录<span className="cy-heading-count">{data.tasks.length}</span></h1></div></div><div className="cy-toolbar"><label className="cy-search"><CyberIcon name="search" size={17} /><input aria-label="搜索扫描" placeholder="搜索扫描记录…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>{data.tasks.length ? <div className="cy-table-wrap"><table className="cy-table"><thead><tr><th>开始时间</th><th>扫描</th><th>状态</th><th>发现</th><th>Token</th><th>耗时</th></tr></thead><tbody>{data.tasks.filter(task => `${task.id} ${task.model} ${task.status} ${task.scope ?? '.'}`.toLowerCase().includes(query.toLowerCase())).map(task => <tr key={task.id}><td className="cy-muted cy-nowrap">{date(task.startedAt)}</td><td><button className="cy-row-link" onClick={() => setScan(task.id)}>{nameOf(task.workspace)}</button></td><td><Status task={task} /></td><td>{task.status === 'completed' ? task.findings : '—'}</td><td className="cy-nowrap">{number(tokens(task))}{task.usage?.unreportedCalls ? ' +' : ''}</td><td className="cy-nowrap cy-muted">{duration(task)}</td></tr>)}</tbody></table></div> : <Empty title="尚无扫描记录" onScan={() => setDrawer(true)} />}</>
              : <><div className="cy-page-heading"><div><h1>{repositoryDetail ? nameOf(data.workspace) : '仓库'}</h1></div></div>{repositoryDetail ? <><div className="cy-stats"><div><strong>{data.tasks.length}</strong><span>扫描记录</span></div><div><strong>{data.findings.filter(f => ['critical', 'high'].includes(f.severity)).length}</strong><span>严重 / 高危</span></div><div><strong>{data.tasks[0] ? date(data.tasks[0].startedAt) : '尚未扫描'}</strong><span>最近扫描</span></div></div><div className="cy-repo-callout"><div><h2>持续建立安全基线</h2></div><button className="cy-primary" onClick={() => setDrawer(true)}>新建扫描</button></div><div className="cy-tabs"><button onClick={() => navigate('findings')}>查看安全发现</button><button onClick={() => navigate('scans')}>查看扫描记录</button><button onClick={() => setRepositoryDetail(false)}>返回仓库列表</button></div></> : <div className="cy-table-wrap"><table className="cy-table"><thead><tr><th>仓库</th><th>来源</th><th>安全状态</th></tr></thead><tbody>{repositories.map(repository => <tr key={repository.path}><td><button className="cy-row-link" onClick={() => { if (repository.sessionId !== sessionId) onRepository(repository.sessionId); else setRepositoryDetail(true) }}>{repository.name}</button></td><td className="cy-muted">DSH 工作区</td><td>{repository.sessionId === sessionId ? data.tasks[0] ? <Status task={data.tasks[0]} /> : <span className="cy-muted">尚未扫描</span> : <span className="cy-muted">选择后查看</span>}</td></tr>)}</tbody></table></div>}</>}
      </div>}
    </main>{drawer && data && <NewScan data={data} remote={remote} sessionId={sessionId} repositories={repositories} onRepository={onRepository} busy={busy} actionError={error} onClose={() => setDrawer(false)} onStart={start} />}
  </div>
}
