import { useEffect, useRef, useState } from 'react'
import {
  active,
  modelsSchema,
  type Dashboard,
  type Models,
  type SecurityRemote,
  type StartRequest,
} from './contracts.ts'
import { CyberIcon } from './cyber-icons.tsx'
import { effortNames, type RepositoryChoice } from './cyber-shared.tsx'

const encodeRoute = (provider: string, model: string) => JSON.stringify([provider, model])
const decodeRoute = (value: string) => JSON.parse(value) as [string, string]

export function NewScanDrawer({
  data,
  remote,
  sessionId,
  repositories,
  onRepository,
  busy,
  actionError,
  onClose,
  onStart,
}: {
  data: Dashboard
  remote: SecurityRemote
  sessionId: string
  repositories: RepositoryChoice[]
  onRepository: (id: string, newScan?: boolean) => void
  busy: boolean
  actionError: string | null
  onClose: () => void
  onStart: (options: Omit<StartRequest, 'sessionId'>) => Promise<boolean>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [scopeMode, setScopeMode] = useState('full')
  const [scope, setScope] = useState('')
  const [instructions, setInstructions] = useState('')
  const [models, setModels] = useState<Models>([])
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState(encodeRoute(data.selection?.provider ?? '', data.selection?.model ?? ''))
  const [effort, setEffort] = useState(data.selection?.ultra ? 'ultra' : data.selection?.reasoningEffort ?? '')

  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    element.showModal()
    return () => {
      element.close()
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    let live = true
    void remote
      .models({ sessionId })
      .then(result => {
        if (!live) return
        if (!result.ok) throw new Error(result.error.message)
        setModels(modelsSchema.parse(result.value))
      })
      .catch(err => {
        if (live) setError(`模型列表读取失败：${String(err)}`)
      })
    return () => {
      live = false
    }
  }, [remote, sessionId])

  const [provider, model] = decodeRoute(route)
  const options = [...models]
  if (data.selection && !options.some(item => item.provider === data.selection!.provider && item.model === data.selection!.model)) {
    options.unshift({
      ...data.selection,
      label: data.selection.model,
      efforts: data.selection.reasoningEffort ? [data.selection.reasoningEffort] : [],
    })
  }
  const selectedModel = options.find(item => item.provider === provider && item.model === model)
  const efforts = selectedModel?.efforts.filter(value => value !== 'ultra') ?? []
  const running = active(data.tasks[0] ?? null)

  return (
    <dialog
      ref={dialog}
      className="cy-drawer"
      aria-labelledby="cy-new-title"
      onCancel={event => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          setError(null)
          void onStart({
            provider,
            model,
            reasoningEffort: effort === 'ultra' ? 'max' : effort,
            ...(effort === 'ultra' ? { ultra: true } : {}),
            scope: scopeMode === 'full' ? '.' : scope,
            instructions: instructions.trim() || undefined,
          }).then(success => {
            if (success) onClose()
          })
        }}
      >
        <header>
          <div>
            <h2 id="cy-new-title">新建扫描</h2>
          </div>
          <button
            type="button"
            className="cy-icon-button"
            aria-label="关闭新建扫描"
            disabled={busy}
            onClick={onClose}
          >
            <CyberIcon name="close" />
          </button>
        </header>
        <div className="cy-drawer-body">
          <label className="cy-field">
            仓库
            <select
              aria-label="仓库"
              disabled={busy}
              value={sessionId}
              onChange={event => onRepository(event.target.value, true)}
            >
              {repositories.map(repository => (
                <option key={repository.sessionId} value={repository.sessionId}>
                  {repository.path}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>扫描方式</legend>
            <label className="cy-radio">
              <input type="radio" checked readOnly />
              <span>仓库扫描</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>扫描范围</legend>
            <label className="cy-radio">
              <input
                type="radio"
                name="scope"
                checked={scopeMode === 'full'}
                onChange={() => setScopeMode('full')}
              />
              <span>整个工作区</span>
            </label>
            <label className="cy-radio">
              <input
                type="radio"
                name="scope"
                checked={scopeMode === 'path'}
                onChange={() => setScopeMode('path')}
              />
              <span>指定目录或文件</span>
            </label>
            {scopeMode === 'path' && (
              <label className="cy-field">
                相对路径
                <input
                  autoFocus
                  required
                  maxLength={2000}
                  placeholder="例如 src/auth"
                  value={scope}
                  onChange={event => setScope(event.target.value)}
                />
              </label>
            )}
          </fieldset>
          <label className="cy-field">
            模型
            <select
              aria-label="模型"
              required
              value={route}
              onChange={event => {
                setRoute(event.target.value)
                setEffort('')
              }}
            >
              <option value={encodeRoute('', '')} disabled>
                选择模型
              </option>
              {options.map(item => {
                const key = encodeRoute(item.provider, item.model)
                return (
                  <option key={key} value={key}>
                    {item.label} · {item.provider}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="cy-field">
            推理强度
            <select aria-label="推理强度" value={effort} onChange={event => setEffort(event.target.value)}>
              <option value="">模型默认</option>
              {efforts.map(value => (
                <option key={value} value={value}>
                  {effortNames[value] ?? value}
                </option>
              ))}
              {selectedModel?.ultra && <option value="ultra">Ultra</option>}
            </select>
          </label>
          <label className="cy-field">
            附加需求
            <textarea
              rows={4}
              maxLength={12000}
              placeholder="关注的攻击面、排除项或审计背景…"
              value={instructions}
              onChange={event => setInstructions(event.target.value)}
            />
          </label>
          {(error || actionError) && (
            <div className="cy-error" role="alert">
              {error || actionError}
            </div>
          )}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="cy-primary" type="submit" disabled={busy || !provider || !model || running}>
            {busy ? '正在启动…' : running ? '已有扫描运行中' : '开始扫描'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
