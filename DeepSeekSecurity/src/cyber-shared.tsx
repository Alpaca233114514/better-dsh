import type { ReactNode } from 'react'
import type { Finding, Task } from './contracts.ts'
import { active } from './contracts.ts'
import { CyberIcon } from './cyber-icons.tsx'

export type RepositoryChoice = { sessionId: string; path: string; name: string }

export const severityNames: Record<Finding['severity'], string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '提示',
  unknown: '未评级',
}

export const statusNames: Record<Task['status'], string> = {
  starting: '准备中',
  running: '扫描中',
  cancelling: '正在停止',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
}

export const effortNames: Record<string, string> = {
  off: '关闭',
  none: '关闭',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最高',
  ultra: '超高',
}

export const formatDate = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })

export const repoName = (value: string) => value.split(/[\\/]/).filter(Boolean).at(-1) ?? value

export const totalTokens = (task: Task) =>
  task.usage?.calls
    ? task.usage.inputTokens + task.usage.outputTokens + task.usage.cacheReadTokens + task.usage.cacheWriteTokens
    : null

export const formatCount = (value: number | null) =>
  value == null ? '未报告' : value.toLocaleString('zh-CN')

export function formatDuration(task: Task) {
  const endMs = active(task) ? Date.now() : Date.parse(task.updatedAt)
  const seconds = Math.max(0, Math.floor((endMs - Date.parse(task.startedAt)) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

export function SeverityBadge({ severity }: { severity: Finding['severity'] }) {
  return <span className={`cy-badge cy-${severity}`}>{severityNames[severity]}</span>
}

export function ScanStatus({ task }: { task: Task }) {
  return (
    <span className={`cy-status cy-status-${task.status}`}>
      <span />
      {statusNames[task.status]}
    </span>
  )
}

export function EmptyState({ title, onScan }: { title: string; onScan?: () => void }) {
  return (
    <div className="cy-empty">
      <span className="cy-empty-icon">
        <CyberIcon size={27} />
      </span>
      <h2>{title}</h2>
      {onScan && (
        <button className="cy-primary" onClick={onScan}>
          <CyberIcon name="plus" />
          新建扫描
        </button>
      )}
    </div>
  )
}

export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cy-meta">
      <div>{label}</div>
      <section>{children}</section>
    </div>
  )
}

export function ReportSection({ title, text }: { title: string; text: string }) {
  return (
    <section className="cy-report-section">
      <h3>{title}</h3>
      <div className="cy-prose">{text}</div>
    </section>
  )
}

export function TabList<T extends string>({
  id,
  label,
  selected,
  options,
  onSelect,
}: {
  id: string
  label: string
  selected: T
  options: [T, string][]
  onSelect: (key: T) => void
}) {
  return (
    <div
      className="cy-tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const index = options.findIndex(([key]) => key === selected)
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
        onSelect(options[next][0])
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next].focus()
      }}
    >
      {options.map(([key, title]) => (
        <button
          key={key}
          role="tab"
          id={`${id}-${key}`}
          aria-controls={`${id}-panel`}
          aria-selected={selected === key}
          tabIndex={selected === key ? 0 : -1}
          onClick={() => onSelect(key)}
        >
          {title}
        </button>
      ))}
    </div>
  )
}

export function downloadText(filename: string, text: string) {
  const mime = filename.endsWith('.json') ? 'application/json' : 'text/markdown;charset=utf-8'
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
