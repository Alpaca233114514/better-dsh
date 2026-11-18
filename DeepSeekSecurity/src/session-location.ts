import { realpath } from 'node:fs/promises'
import { relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionCreateRequest } from '@deepseek-ai/dsh-api-session-controller'

interface Workspace { id: string; path: string; sessionIds: readonly string[] }
interface WorkspaceRegistry { list(): readonly Workspace[] }

/** cwd 只确定目录；workspaceId 才会登记分组归属。 cwd selects a directory; workspaceId records group membership. */
export async function sessionLocation(ctx: Context, workspace: string, sourceSessionId?: string): Promise<Pick<SessionCreateRequest, 'workspaceId' | 'cwd'>> {
  const registry = (ctx as unknown as { get(name: string): WorkspaceRegistry | undefined }).get('workspaceRegistry')
  if (!registry) return { cwd: workspace }
  const root = await realpath(workspace)
  const matches = (await Promise.all(registry.list().map(async item => {
    try { return relative(root, await realpath(item.path)) === '' ? item : undefined }
    catch { return undefined }
  }))).filter((item): item is Workspace => !!item)
  const owned = matches.find(item => sourceSessionId && item.sessionIds.includes(sourceSessionId))
  if (owned) return { workspaceId: owned.id as NonNullable<SessionCreateRequest['workspaceId']> }
  if (matches.length > 1) throw new Error('同一目录存在多个工作区分组，请先将来源会话归入对应工作区。')
  return matches[0] ? { workspaceId: matches[0].id as NonNullable<SessionCreateRequest['workspaceId']> } : { cwd: workspace }
}
