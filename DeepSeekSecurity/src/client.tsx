import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, DisclosureRow, IconChecklistOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityRemote } from './contracts.ts'
import { contribution } from './remote.ts'
import { source } from './mention.ts'
import { phaseLabels, ProgressObserver } from './progress.ts'
import styles from './panel.css'

export function SecurityProgress({ sessionId, remote }: { sessionId: string; remote: SecurityRemote }) {
  const observer = useMemo(() => new ProgressObserver(remote, sessionId), [remote, sessionId])
  const { task, error, stopping } = useSyncExternalStore(observer.subscribe, observer.getSnapshot)
  const [open, setOpen] = useState(true)
  useEffect(() => { observer.start(); return () => observer.dispose() }, [observer])
  // Neither choosing the mention nor historical/terminal tasks create a panel.
  if (!task) return null
  const cancelling = stopping || task.status === 'cancelling'
  const phase = ['preflight', 'threat_model'].includes(task.phase) ? 0 : task.phase === 'reporting' ? 2 : 1
  return <section className="dss-panel" aria-label="DeepSeek Security 扫描进度">
    <div className="dss-head">
      <DisclosureRow title="DeepSeek Security" icon={<IconChecklistOutlineRegular />}
        open={open} expandable onToggle={() => setOpen(value => !value)} expandOnRowClick
        collapsedContent={<span className="dss-summary" role="status">{cancelling ? '正在停止' : phaseLabels[task.phase]}</span>}
        keepContentWhenOpen />
      <Button size="sm" disabled={cancelling} onClick={() => { void observer.cancel() }}>停止</Button>
    </div>
    {open && <ul className="dss-steps">
      {['分析代码与威胁模型', '检查并验证潜在漏洞', '生成安全报告'].map((label, index) =>
        <li key={label}><StateDot state={index < phase ? 'done' : index === phase ? 'ongoing' : 'idle'} appearance="step" /><span>{label}</span></li>)}
    </ul>}
    {error && <div className="dss-error" role="alert">{error}</div>}
  </section>
}

export const inject = ['inputTriggers', 'slots', 'remote']
export async function apply(ctx: Context) {
  ctx.effect(() => ctx.inputTriggers.registerSource(source))
  await ctx.remote.$mount(contribution)
  ctx.effect(() => {
    const element = document.createElement('style')
    element.textContent = styles
    document.head.append(element)
    return () => element.remove()
  })
  ctx.inject(['slots', 'remote.deepseekSecurity'], scope => {
    function Dock({ sessionId }: PropsRuntime<'conversation.input.dock'>) {
      return <SecurityProgress key={sessionId} sessionId={sessionId} remote={scope.remote.deepseekSecurity} />
    }
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: 'deepseek-security', order: 20,
    }, Dock))
  })
}
