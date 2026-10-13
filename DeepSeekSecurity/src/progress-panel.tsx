import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button, DisclosureRow, IconChecklistOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityRemote } from './contracts.ts'
import { phaseLabels, ProgressObserver } from './progress.ts'

export function SecurityProgress({ sessionId, remote }: { sessionId: string; remote: SecurityRemote }) {
  const observer = useMemo(() => new ProgressObserver(remote, sessionId), [remote, sessionId])
  const { task, error, stopping } = useSyncExternalStore(observer.subscribe, observer.getSnapshot)
  const [open, setOpen] = useState(true)
  useEffect(() => { observer.start(); return () => observer.dispose() }, [observer])
  // Choosing a mention or restoring a terminal task must not open a panel.
  if (!task) return null
  const cancelling = stopping || task.status === 'cancelling'
  const phase = ['preflight', 'threat_model'].includes(task.phase) ? 0 : task.phase === 'reporting' ? 2 : 1
  const summary = cancelling ? '正在停止' : phaseLabels[task.phase]
  return <section className="dss-panel" aria-label="DeepSeek Security 扫描进度">
    <div className="dss-head">
      <DisclosureRow title="DeepSeek Security" icon={<IconChecklistOutlineRegular />}
        open={open} expandable onToggle={() => setOpen(value => !value)} expandOnRowClick
        rowClassName="dss-heading" contentClassName="dss-heading-content" contentLayoutClassName="dss-heading-text"
        collapsedContent={<span className="dss-summary" role="status" title={summary}>{summary}</span>}
        keepContentWhenOpen />
      {/* rc.2 has no headerAccessory; keep the native action outside the disclosure. */}
      <Button className="dss-stop" size="sm" disabled={cancelling} onClick={() => { void observer.cancel() }}>停止</Button>
    </div>
    {open && <ul className="dss-steps">
      {['分析代码与威胁模型', '检查并验证潜在漏洞', '生成安全报告'].map((label, index) => {
        const state = index < phase ? 'done' : index === phase ? 'ongoing' : 'idle'
        const status = index < phase ? '已完成' : index === phase ? (cancelling ? '正在停止' : '进行中') : '待处理'
        return <li key={label}>
          <span className="dss-glyph" role="img" aria-label={status}><StateDot state={state} /></span>
          <span className="dss-step-label" title={label}>{label}</span>
        </li>
      })}
    </ul>}
    {error && <div className="dss-error" role="alert">{error}</div>}
  </section>
}
