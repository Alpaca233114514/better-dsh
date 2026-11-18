import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  active,
  detailsSchema,
  findingStatuses,
  findingStatusLabels,
  type Details,
  type Finding,
  type FindingStatus,
  type SecurityRemote,
  type Task,
} from './contracts.ts'
import { projectFindings } from './dashboard.ts'
import { phaseLabels } from './progress.ts'
import { CyberIcon } from './cyber-icons.tsx'
import {
  EmptyState,
  MetaRow,
  ReportSection,
  ScanStatus,
  SeverityBadge,
  TabList,
  downloadText,
  formatCount,
  formatDate,
  formatDuration,
  repoName,
  statusNames,
  totalTokens,
} from './cyber-shared.tsx'

export function FindingsTable({
  findings,
  tasks,
  onSelect,
}: {
  findings: Finding[]
  tasks: Task[]
  onSelect: (finding: Finding) => void
}) {
  const taskById = new Map(tasks.map(task => [task.id, task]))
  return (
    <div className="cy-table-wrap cy-findings-table" role="region" aria-label="安全发现列表" tabIndex={0}>
      <table className="cy-table">
        <thead>
          <tr>
            <th scope="col">严重程度</th>
            <th scope="col">发现</th>
            <th scope="col">状态</th>
            <th scope="col">最近发现</th>
          </tr>
        </thead>
        <tbody>
          {findings.map(finding => {
            const sourceTask = taskById.get(finding.taskId)
            const firstLocation = finding.locations[0]
            return (
              <tr key={finding.id}>
                <td>
                  <SeverityBadge severity={finding.severity} />
                </td>
                <td>
                  <button className="cy-row-link" onClick={() => onSelect(finding)}>
                    {finding.title}
                  </button>
                  <div className="cy-finding-context">
                    {sourceTask ? repoName(sourceTask.workspace) : '来源仓库不可用'}
                    {firstLocation && (
                      <span>
                        {' · '}
                        {firstLocation.path}
                        {firstLocation.startLine ? `:${firstLocation.startLine}` : ''}
                      </span>
                    )}
                  </div>
                  <details className="cy-finding-origin">
                    <summary>
                      扫描来源{finding.occurrences > 1 ? ` · 出现 ${finding.occurrences} 次` : ''}
                    </summary>
                    <div>{sourceTask?.workspace ?? '来源仓库不可用'}</div>
                    <div>扫描 {finding.taskId}</div>
                  </details>
                </td>
                <td>
                  <span className={`cy-badge cy-finding-${finding.status}`}>
                    {findingStatusLabels[finding.status]}
                  </span>
                </td>
                <td data-label="最近发现" className="cy-nowrap cy-muted">
                  {formatDate(finding.lastSeen)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!findings.length && <div className="cy-no-match">没有匹配的发现</div>}
    </div>
  )
}

export function FindingDetail({
  finding,
  task,
  onBack,
  onScan,
  onStatus,
  busy,
}: {
  finding: Finding
  task?: Task
  onBack: () => void
  onScan: () => void
  onStatus: (status: FindingStatus) => void
  busy: boolean
}) {
  const [tab, setTab] = useState<'report' | 'fix'>('report')
  const id = useId()
  const evidence = useRef<HTMLElement>(null)
  const locationText = finding.locations
    .map(loc => `${loc.path}${loc.startLine ? `:${loc.startLine}${loc.endLine ? `–${loc.endLine}` : ''}` : ''}`)
    .join('\n')

  return (
    <>
      <div className="cy-breadcrumb">
        <button onClick={onBack}>安全发现</button>
        <span>/</span>
        <span>{finding.title}</span>
      </div>
      <div className="cy-detail-grid">
        <article>
          <h1>{finding.title}</h1>
          <div className="cy-detail-summary">
            <SeverityBadge severity={finding.severity} />
            <span className={`cy-badge cy-finding-${finding.status}`}>
              {findingStatusLabels[finding.status]}
            </span>
            {task && <span className="cy-muted">{repoName(task.workspace)}</span>}
          </div>
          <div className="cy-detail-actions">
            <button
              onClick={() => {
                setTab('report')
                requestAnimationFrame(() => {
                  evidence.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
                  evidence.current?.focus()
                })
              }}
            >
              查看证据
            </button>
            <button onClick={() => setTab('fix')}>查看修复建议</button>
          </div>
          <TabList
            id={id}
            label="发现详情"
            selected={tab}
            options={[
              ['report', '报告'],
              ['fix', '修复建议'],
            ]}
            onSelect={setTab}
          />
          <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
            {tab === 'report' ? (
              <>
                <ReportSection title="摘要" text={finding.summary} />
                <ReportSection title="代码位置" text={locationText} />
                <section ref={evidence} tabIndex={-1} aria-label="发现证据">
                  <ReportSection title="证据" text={finding.evidence || '报告未附加独立代码证据。'} />
                </section>
                <ReportSection
                  title="验证记录"
                  text={finding.validation || '未提供验证记录；当前结论来自静态源码审计。'}
                />
                <ReportSection title="攻击路径" text={finding.attackPath || '未提供单独的攻击路径记录。'} />
              </>
            ) : (
              <ReportSection title="修复建议" text={finding.remediation || '报告未提供修复建议。'} />
            )}
          </div>
        </article>
        <aside className="cy-metadata">
          <MetaRow label="严重程度">
            <SeverityBadge severity={finding.severity} />
          </MetaRow>
          <MetaRow label="状态">
            <select
              aria-label="处置状态"
              value={finding.status}
              disabled={busy}
              onChange={event => onStatus(event.target.value as FindingStatus)}
            >
              {findingStatuses.map(status => (
                <option key={status} value={status}>
                  {findingStatusLabels[status]}
                </option>
              ))}
            </select>
          </MetaRow>
          <MetaRow label="仓库">{task?.workspace ?? '—'}</MetaRow>
          <MetaRow label="首次发现">{formatDate(finding.firstSeen)}</MetaRow>
          <MetaRow label="出现次数">{finding.occurrences} 次扫描</MetaRow>
          <MetaRow label="模型">{task?.model ?? '—'}</MetaRow>
          <button onClick={onScan}>
            查看来源扫描
            <CyberIcon name="chevron" size={14} />
          </button>
        </aside>
      </div>
    </>
  )
}

export function ScanDetail({
  task,
  remote,
  sessionId,
  onBack,
  onFinding,
  busy,
  onCancel,
  onOpenConversation,
  findings,
}: {
  task: Task
  remote: SecurityRemote
  sessionId: string
  onBack: () => void
  onFinding: (finding: Finding) => void
  busy: boolean
  onCancel: () => void
  onOpenConversation: (id: string) => void
  findings: Finding[]
}) {
  const id = useId()
  const [tab, setTab] = useState<'findings' | 'outputs' | 'timeline'>('findings')
  const [result, setResult] = useState<{ id: string; details?: Details; error?: string } | null>(null)

  useEffect(() => {
    let live = true
    if (task.status === 'completed') {
      void remote
        .details({ sessionId, taskId: task.id })
        .then(value => {
          if (!live) return
          if (!value.ok) throw new Error(value.error.message)
          setResult({ id: task.id, details: detailsSchema.parse(value.value) })
        })
        .catch(error => {
          if (live) setResult({ id: task.id, error: String(error) })
        })
    }
    return () => {
      live = false
    }
  }, [remote, sessionId, task.id, task.status])

  const details = result?.id === task.id ? result.details : undefined
  const projection = useMemo(() => {
    try {
      if (!details) return { findings: [], error: null }
      const projected = projectFindings([{ task, details }]).map(finding => {
        const scopedId = JSON.stringify([sessionId, finding.id])
        const current = findings.find(item => item.id === scopedId)
        return { ...finding, id: scopedId, status: current?.status ?? finding.status }
      })
      return { findings: projected, error: null }
    } catch (error) {
      return { findings: [], error: String(error) }
    }
  }, [task, details, findings, sessionId])

  const timeline = task.timeline ?? [{ phase: task.phase, at: task.updatedAt }]

  return (
    <>
      <div className="cy-breadcrumb">
        <button onClick={onBack}>扫描记录</button>
        <span>/</span>
        <span>扫描 {task.id.slice(0, 8)}</span>
      </div>
      <div className="cy-detail-grid">
        <article>
          <div className="cy-scan-heading">
            <h1>标准扫描 · {repoName(task.workspace)}</h1>
            {active(task) && (
              <button disabled={busy || task.status === 'cancelling'} onClick={onCancel}>
                停止扫描
              </button>
            )}
          </div>
          <div className="cy-scan-subtitle">
            <ScanStatus task={task} />
            <span>
              {formatDate(task.startedAt)} · {formatDuration(task)}
            </span>
          </div>
          <TabList
            id={id}
            label="扫描详情"
            selected={tab}
            options={[
              ['findings', '安全发现'],
              ['outputs', '输出文件'],
              ['timeline', '执行时间线'],
            ]}
            onSelect={setTab}
          />
          {task.error && (
            <div className="cy-error" role="alert">
              {task.error}
            </div>
          )}
          {result?.id === task.id && result.error && (
            <div className="cy-error" role="alert">
              {result.error}
            </div>
          )}
          {projection.error && (
            <div className="cy-error" role="alert">
              {projection.error}
            </div>
          )}
          <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
            {tab === 'findings' &&
              (task.status === 'completed' ? (
                details ? (
                  <FindingsTable tasks={[task]} findings={projection.findings} onSelect={onFinding} />
                ) : (
                  <div className="cy-no-match">{result?.error ? '报告不可用' : '正在读取报告…'}</div>
                )
              ) : (
                <EmptyState title={active(task) ? phaseLabels[task.phase] : '扫描尚未完成'} />
              ))}

            {tab === 'outputs' &&
              (details ? (
                <>
                  <div className="cy-output-actions">
                    <button onClick={() => downloadText(`security-${task.id.slice(0, 8)}.md`, details.report)}>
                      导出报告
                    </button>
                    <button onClick={() => downloadText(`findings-${task.id.slice(0, 8)}.json`, details.findings)}>
                      导出 JSON
                    </button>
                  </div>
                  <ReportSection title="报告" text={details.report} />
                  {details.threatModel && <ReportSection title="威胁模型" text={details.threatModel} />}
                </>
              ) : (
                <div className="cy-no-match">完成后显示报告和威胁模型</div>
              ))}

            {tab === 'timeline' && (
              <ol className="cy-timeline">
                {timeline.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span className="cy-timeline-dot" />
                    <div>
                      <strong>{phaseLabels[event.phase]}</strong>
                      <time>{formatDate(event.at)}</time>
                    </div>
                  </li>
                ))}
                {!active(task) && (
                  <li>
                    <span className="cy-timeline-dot" />
                    <div>
                      <strong>{statusNames[task.status]}</strong>
                      <time>{formatDate(task.updatedAt)}</time>
                    </div>
                  </li>
                )}
              </ol>
            )}
          </div>
        </article>
        <aside className="cy-metadata">
          <MetaRow label="仓库">{repoName(task.workspace)}</MetaRow>
          <MetaRow label="范围">{task.scope ?? '.'}</MetaRow>
          <MetaRow label="模型">{task.model}</MetaRow>
          <MetaRow label="Token 用量">
            {formatCount(totalTokens(task))}
            {task.usage?.unreportedCalls ? ' +' : ''}
          </MetaRow>
          <MetaRow label="来源">DSH · 本地静态审计</MetaRow>
          <MetaRow label="附加需求">{task.instructions || '标准安全审计'}</MetaRow>
          <MetaRow label="扫描编号">{task.scanId ?? '尚未注册'}</MetaRow>
          {task.conversationId && (
            <button onClick={() => onOpenConversation(task.conversationId!)}>
              打开扫描会话
              <CyberIcon name="chevron" size={14} />
            </button>
          )}
        </aside>
      </div>
    </>
  )
}
