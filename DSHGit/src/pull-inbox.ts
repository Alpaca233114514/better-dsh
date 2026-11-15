import { useEffect, useRef, useState } from 'react'
import { unwrap, type GitRemote, type Result } from './contracts.ts'
import type { PullSummary } from './pulls.ts'

export type Workspace = { sessionId: string; path: string }
type Source = { value?: Result; error?: string }
export type InboxPull = PullSummary & { repository: string; sessionId: string }

export function usePullInbox(remote: GitRemote, workspaces: Workspace[], revision: number) {
  const signature = JSON.stringify(workspaces)
  const [sources, setSources] = useState<Record<string, Source>>({})
  const [progress, setProgress] = useState({ done: 0, total: workspaces.length })
  const previous = useRef(revision)
  useEffect(() => {
    const items: Workspace[] = JSON.parse(signature)
    const force = previous.current !== revision
    previous.current = revision
    let alive = true, cursor = 0, done = 0
    setProgress({ done, total: items.length })
    async function worker() {
      while (alive && cursor < items.length) {
        const { sessionId } = items[cursor++]
        let update: Source
        try { update = { value: unwrap(await remote.run({ sessionId, action: 'pullList', refresh: force })) } }
        catch (error) { update = { error: (error as Error).message } }
        if (!alive) return
        setSources(last => ({ ...last, [sessionId]: { ...last[sessionId], error: undefined, ...update } }))
        setProgress({ done: ++done, total: items.length })
      }
    }
    void worker()
    void worker()
    return () => { alive = false }
  }, [signature, remote, revision])
  const unique = new Map<string, InboxPull>()
  const errors: string[] = []
  for (const { sessionId, path } of workspaces) {
    const source = sources[sessionId]
    if (source?.error) errors.push(path + ' — ' + source.error)
    for (const pr of source?.value?.pulls ?? []) {
      unique.set(pr.url.toLowerCase(), { ...pr, sessionId, repository: source!.value!.repository! })
    }
  }
  const pulls = [...unique.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.url.localeCompare(b.url))
  return { pulls, errors, ...progress }
}
