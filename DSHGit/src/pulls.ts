import { z } from 'zod'

const actor = z.object({ login: z.string() }).nullable()
export const pullSummary = z.object({
  number: z.number().int().positive(), title: z.string(), state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  isDraft: z.boolean(), author: actor, updatedAt: z.string(), url: z.string().url(),
})
export const pullDetail = pullSummary.extend({
  body: z.string(), baseRefName: z.string(), headRefName: z.string(),
  additions: z.number(), deletions: z.number(), changedFiles: z.number(),
  comments: z.array(z.object({ author: actor, body: z.string(), createdAt: z.string() })),
  commits: z.array(z.object({ oid: z.string(), messageHeadline: z.string(), committedDate: z.string() })),
  latestReviews: z.array(z.object({ author: actor, state: z.string() })),
  reviewRequests: z.array(z.object({ login: z.string().optional(), name: z.string().optional() })),
  statusCheckRollup: z.array(z.object({
    name: z.string().nullable().optional(), context: z.string().nullable().optional(),
    status: z.string().nullable().optional(), conclusion: z.string().nullable().optional(), state: z.string().nullable().optional(),
  })).nullable().optional(),
})
export const pullFile = z.object({ filename: z.string(), additions: z.number(), deletions: z.number(), patch: z.string().optional() })
export type PullSummary = z.infer<typeof pullSummary>
export type PullDetail = z.infer<typeof pullDetail>
export type PullFile = z.infer<typeof pullFile>
export const filesPerPage = 20
