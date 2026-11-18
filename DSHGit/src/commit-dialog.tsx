import type { RefObject } from 'react'
import type { GitState, Request, Result } from './contracts.ts'
import { Icon } from './icons.tsx'

export function CommitDialog({
  commitDialog,
  commitId,
  messageInput,
  state,
  branches,
  branchPrefix,
  newBranch,
  hasChanges,
  message,
  include,
  busy,
  writable,
  canCommit,
  canPush,
  pr,
  onClose,
  onBranchPrefix,
  onNewBranch,
  onMessage,
  onInclude,
  onAct,
  onOpenPR,
}: {
  commitDialog: RefObject<HTMLDialogElement>
  commitId: string
  messageInput: RefObject<HTMLTextAreaElement>
  state: GitState
  branches: string[]
  branchPrefix: string
  newBranch: string
  hasChanges: boolean
  message: string
  include: boolean
  busy: string | null
  writable: boolean
  canCommit: boolean
  canPush: boolean
  pr: Result['pr'] | undefined
  onClose: () => void
  onBranchPrefix: (value: string) => void
  onNewBranch: (value: string) => void
  onMessage: (value: string) => void
  onInclude: (value: boolean) => void
  onAct: (action: Request['action'], extra?: Partial<Request>) => void
  onOpenPR: () => void
}) {
  return (
    <dialog
      ref={commitDialog}
      id={commitId}
      className="dg-commit-shade"
      aria-label="提交与推送"
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClick={onClose}
    >
      <section className="dg-commit-card" onClick={event => event.stopPropagation()}>
        <div className="dg-branch-select">
          <Icon name="branch" />
          <select
            aria-label="当前分支"
            value={state.branch}
            disabled={!writable}
            onChange={event => onAct('switch', { branch: event.target.value })}
          >
            {!state.branch && <option value="">Detached HEAD</option>}
            {Array.from(new Set([state.branch, ...branches]))
              .filter(Boolean)
              .map(branch => (
                <option key={branch}>{branch}</option>
              ))}
          </select>
        </div>

        <div className="dg-new-branch">
          <div className="dg-branch-name">
            <input
              className="dg-prefix"
              aria-label="分支前缀"
              title="分支前缀（可修改或留空）"
              value={branchPrefix}
              onChange={event => onBranchPrefix(event.target.value)}
              placeholder="前缀"
            />
            <span aria-hidden="true">/</span>
            <input
              aria-label="新分支名称"
              value={newBranch}
              onChange={event => onNewBranch(event.target.value)}
              placeholder="新分支"
            />
          </div>
          <button
            disabled={!writable || !newBranch.trim()}
            onClick={() => {
              const prefix = branchPrefix.trim().replace(/\/+$/, '')
              onAct('createBranch', { branch: prefix ? `${prefix}/${newBranch.trim()}` : newBranch.trim() })
            }}
          >
            创建分支
          </button>
        </div>

        {hasChanges && (
          <>
            <textarea
              ref={messageInput}
              className="dg-message"
              aria-label="提交信息"
              disabled={!!busy}
              value={message}
              onChange={event => onMessage(event.target.value)}
              placeholder="提交信息（留空自动生成）…"
              rows={3}
            />
            <div className="dg-include">
              <label className="dg-check">
                <input
                  type="checkbox"
                  checked={include}
                  disabled={!!busy}
                  onChange={event => onInclude(event.target.checked)}
                />
                包含未暂存的更改
              </label>
              <span className="dg-stats">
                <b>+{state.additions.toLocaleString()}</b>
                <em>-{state.deletions.toLocaleString()}</em>
              </span>
            </div>
          </>
        )}

        <div className="dg-commit-actions">
          {hasChanges && (
            <>
              <button
                disabled={!canCommit}
                onClick={() => onAct('commit', { message, includeUnstaged: include })}
              >
                <Icon name="commit" />
                <span>提交</span>
                <kbd>Ctrl/⌘ ↵</kbd>
              </button>
              <button
                disabled={!canCommit}
                onClick={() => onAct('commitPush', { message, includeUnstaged: include })}
              >
                <Icon name="push" />
                <span>提交并推送</span>
                <kbd>Ctrl/⌘ ⇧ ↵</kbd>
              </button>
            </>
          )}
          {!hasChanges && (
            <button disabled={!canPush} onClick={() => onAct('push')}>
              <Icon name="push" />
              <span>推送</span>
            </button>
          )}
          <button disabled={!!busy} onClick={onOpenPR}>
            <Icon name="github" />
            <span>{pr ? '查看 Pull Request' : '创建 Pull Request'}</span>
          </button>
          {hasChanges && (
            <button disabled={!canPush} onClick={() => onAct('push')}>
              <Icon name="push" />
              <span>推送</span>
            </button>
          )}
        </div>
      </section>
    </dialog>
  )
}
