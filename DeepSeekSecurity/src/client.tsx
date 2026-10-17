import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconChecklistOutlineRegular, IconChevronDownOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { stages, type SecurityRemote, type Task } from './contracts.ts'
import { contribution } from './remote.ts'
import { source } from './mention.ts'
import { activityFreshness, activitySummary, currentStage, elapsedLabel, stageLabels, ProgressObserver } from './progress.ts'
import styles from './panel.css'

export function SecurityProgress({ sessionId, remote }: { sessionId: string; remote: SecurityRemote }) {
  const observer = useMemo(() => new ProgressObserver(remote, sessionId), [remote, sessionId])
  const { task, error, stopping } = useSyncExternalStore(observer.subscribe, observer.getSnapshot)
  useEffect(() => { observer.start(); return () => observer.dispose() }, [observer])
  // Neither choosing the mention nor historical/terminal tasks create a panel.
  if (!task) return null
  return <SecurityProgressView key={task.id} task={task} error={error} stopping={stopping}
    onCancel={() => { void observer.cancel() }} />
}

/** Native Todo geometry; isolated presentation also permits offline visual verification. */
export function SecurityProgressView({ task, error, stopping, onCancel }: {
  task: Task; error: string | null; stopping: boolean; onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const bodyId = useId()
  const list = useRef<HTMLOListElement>(null)
  const stage = currentStage(task)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const container = list.current
    const current = container?.querySelector<HTMLElement>('[aria-current="step"]')
    if (open && container && current) container.scrollTop = current.offsetTop - container.clientHeight / 2 + current.offsetHeight / 2
  }, [open, stage])
  const cancelling = stopping || task.status === 'cancelling'
  return <section className="dss-panel" aria-label="DeepSeek Security 扫描进度">
    <div className="dss-head">
      <button type="button" className="dss-toggle" aria-expanded={open} aria-controls={bodyId}
        onClick={() => setOpen(value => !value)}>
        <span className="dss-lead" aria-hidden><IconChecklistOutlineRegular /></span>
        <span className="dss-title">安全扫描</span>
        <span key={cancelling ? 'cancelling' : `${stage}:${task.activity}:${task.activityTarget}`} className="dss-summary" role="status"
          title={activitySummary(task)}>
          {cancelling ? '正在停止' : activitySummary(task)}
        </span>
        <span className="dss-elapsed" title="当前动作耗时">{elapsedLabel(task.activityAt ?? task.stageStartedAt ?? task.updatedAt, now)}</span>
        <span className="dss-chevron" data-open={open} aria-hidden><IconChevronDownOutlineRegular /></span>
      </button>
      <Button size="sm" disabled={cancelling} onClick={onCancel}>{cancelling ? '停止中' : '停止'}</Button>
    </div>
    <div className="dss-live">
      <span>{stageLabels[stage]}{task.filesRead !== undefined ? ` · 已读取 ${task.filesRead} 个文件 · 搜索 ${task.searches ?? 0} 次` : ''}</span>
      <span>{activityFreshness(task, now)}</span>
    </div>
    <div id={bodyId} className="dss-expand" data-open={open} aria-hidden={!open}>
      <div className="dss-expand-inner">
        <ol ref={list} className="dss-steps" aria-label="扫描步骤">
          {stages.map(step => {
            const state = step === stage ? 'ongoing' : task.completedStages?.includes(step) ? 'done' : 'idle'
            return <li key={step} data-state={state} aria-current={step === stage ? 'step' : undefined}>
              <span className="dss-glyph" role="img" aria-label={state === 'done' ? '已完成' : state === 'ongoing' ? '当前步骤' : '未执行'}>
                <StateDot state={state} />
              </span><span className="dss-step-label">{stageLabels[step]}</span>
            </li>
          })}
        </ol>
        <div className="dss-detail">
          <span>{!task.stage ? '本轮由旧版后台启动；完成后重启 DSH 可显示实时活动' : `本阶段 ${elapsedLabel(task.stageStartedAt ?? task.updatedAt, now)}`}</span>
          <span>{task.files !== undefined ? `${task.files.toLocaleString()} 个文件 · ` : ''}总计 {elapsedLabel(task.startedAt, now)}</span>
        </div>
      </div>
    </div>
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
