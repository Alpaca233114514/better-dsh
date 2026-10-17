import { z } from 'zod'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

export const requestSchema = z.object({
  sessionId: z.string().min(1),
  action: z.enum(['state', 'diff', 'stage', 'unstage', 'commit', 'commitPush', 'push', 'branches', 'switch', 'createBranch', 'prInfo', 'createPR']),
  path: z.string().optional(), staged: z.boolean().optional(), message: z.string().max(10000).optional(),
  includeUnstaged: z.boolean().optional(), branch: z.string().optional(),
  title: z.string().max(256).optional(), body: z.string().max(60000).optional(),
  base: z.string().optional(), draft: z.boolean().optional(),
}).strict()
export type Request = z.infer<typeof requestSchema>
export const fileSchema = z.object({ path: z.string(), original: z.string().optional(), index: z.string(), worktree: z.string() })
export type FileChange = z.infer<typeof fileSchema>
export const stateSchema = z.object({
  root: z.string(), name: z.string(), branch: z.string(), upstream: z.string(),
  ahead: z.number(), behind: z.number(), additions: z.number(), deletions: z.number(),
  files: z.array(fileSchema), protected: z.boolean(), writable: z.boolean().optional(),
})
export type GitState = z.infer<typeof stateSchema>
export const prSchema = z.object({ number: z.number(), title: z.string(), url: z.string().url() })
export const resultSchema = z.object({
  state: stateSchema.optional(), text: z.string().optional(),
  branches: z.array(z.string()).optional(), base: z.string().optional(),
  pr: prSchema.nullable().optional(), notice: z.string().optional(),
}).strict()
export type Result = z.infer<typeof resultSchema>
export interface GitRemote { run(request: Request): Promise<RemoteResult<Result>> }
export const protectedBranch = (branch: string) => /^(main|master)$/i.test(branch)
export const unwrap = <T,>(result: RemoteResult<T>): T => {
  if (!result.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error.message)
  return result.value
}
