import { useEffect, useSyncExternalStore } from 'react'
import { dismissNotice, getNotices, subscribeOperations, type GitNotice } from './operations.ts'

function Toast({ notice }: { notice: GitNotice }) {
  useEffect(() => {
    if (notice.error) return
    const timer = setTimeout(() => dismissNotice(notice.id), 6000)
    return () => clearTimeout(timer)
  }, [notice])
  return <div className="dg-toast" data-error={notice.error} role={notice.error ? 'alert' : 'status'}>
    <span className="dg-toast-symbol" aria-hidden="true">{notice.error ? '!' : '✓'}</span>
    <span>{notice.message}</span><button type="button" aria-label="关闭通知" onClick={() => dismissNotice(notice.id)}>×</button>
  </div>
}
export function GitNotifications() {
  const notices = useSyncExternalStore(subscribeOperations, getNotices)
  return <div className="dg-toasts" aria-label="DSHGit 操作通知">{notices.map(notice => <Toast key={notice.id} notice={notice}/>)}</div>
}
