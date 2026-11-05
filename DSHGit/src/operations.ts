import { unwrap, type GitRemote, type Request, type Result } from './contracts.ts'

export interface GitNotice { id: number; error: boolean; message: string }
const pending = new Map<string, Request['action']>()
const listeners = new Set<() => void>()
let notices: GitNotice[] = [], sequence = 0
const labels: Partial<Record<Request['action'], string>> = { commit: '提交', commitPush: '提交并推送', push: '推送', createPR: '创建 PR' }
const emit = () => { for (const listener of listeners) listener() }
export const subscribeOperations = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const pendingOperation = (sessionId: string) => pending.get(sessionId) ?? ''
export const getNotices = () => notices
export function dismissNotice(id: number) { notices = notices.filter(item => item.id !== id); emit() }

// Operations outlive tab bodies; 后台任务与通知不依赖标签页是否仍挂载。
export async function runOperation(remote: GitRemote, request: Request, workspace: string): Promise<Result> {
  if (pending.has(request.sessionId)) throw new Error('该会话有 Git 操作正在执行。')
  pending.set(request.sessionId, request.action); emit()
  const label = labels[request.action]
  const notify = (message: string, error: boolean) => {
    notices = [...notices, { id: ++sequence, error, message: `${workspace} · ${message}` }]; emit()
  }
  try {
    const result = unwrap(await remote.run(request))
    if (label) notify(result.notice || `${label}完成`, result.partialFailure === true)
    return result
  } catch (error) {
    if (label) notify(`${label}失败：${error instanceof Error ? error.message : String(error)}`, true)
    throw error
  } finally { pending.delete(request.sessionId); emit() }
}
