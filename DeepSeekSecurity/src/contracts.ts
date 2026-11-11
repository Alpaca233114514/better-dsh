import { z } from 'zod'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

export const phases = ['preflight', 'threat_model', 'discovery', 'validation', 'attack_path', 'reporting'] as const
export type Phase = typeof phases[number]
export const usageSchema = z.object({
  inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative(),
  cacheReadTokens: z.number().nonnegative(), cacheWriteTokens: z.number().nonnegative(),
  calls: z.number().int().nonnegative(), unreportedCalls: z.number().int().nonnegative(),
})
export const timelineSchema = z.object({ at: z.string(), phase: z.enum(phases) })
export const taskSchema = z.object({
  id: z.string(), workspace: z.string(), sessionId: z.string(), scanId: z.string().optional(),
  status: z.enum(['starting', 'running', 'cancelling', 'completed', 'failed', 'cancelled', 'interrupted']),
  phase: z.enum(phases), startedAt: z.string(), updatedAt: z.string(),
  provider: z.string(), model: z.string(), findings: z.number().int().nonnegative(),
  reasoningEffort: z.string().optional(),
  ultra: z.boolean().optional(), conversation: z.boolean().optional(), conversationId: z.string().optional(),
  instructions: z.string().optional(),
  completed: z.number().int().nonnegative().optional(), total: z.number().int().nonnegative().optional(),
  error: z.string().optional(), reportPath: z.string().optional(),
  scope: z.string().optional(), usage: usageSchema.optional(), timeline: z.array(timelineSchema).optional(),
})
export type Task = z.infer<typeof taskSchema>
export const stateSchema = z.object({ workspace: z.string(), task: taskSchema.nullable() })
export type State = z.infer<typeof stateSchema>
export const requestSchema = z.object({ sessionId: z.string().min(1) }).strict()
export type Request = z.infer<typeof requestSchema>
export const startSchema = requestSchema.extend({
  instructions: z.string().max(12000).optional(), scope: z.string().min(1).max(2000).optional(),
  provider: z.string().min(1).optional(), model: z.string().min(1).optional(), reasoningEffort: z.string().optional(),
  ultra: z.boolean().optional(),
}).strict()
export type StartRequest = z.infer<typeof startSchema>
export const detailRequestSchema = requestSchema.extend({ taskId: z.string().min(1).optional() }).strict()
export type DetailRequest = z.infer<typeof detailRequestSchema>
export const detailsSchema = z.object({ report: z.string(), findings: z.string(), threatModel: z.string() })
export type Details = z.infer<typeof detailsSchema>
export const findingStatuses = ['new', 'triaged', 'in_progress', 'fixed', 'wont_fix', 'duplicate', 'false_positive'] as const
export const findingStatusSchema = z.enum(findingStatuses)
export type FindingStatus = z.infer<typeof findingStatusSchema>
export const findingStatusLabels: Record<FindingStatus, string> = { new: '新发现', triaged: '已分诊', in_progress: '处理中', fixed: '已修复', wont_fix: '不修复', duplicate: '重复', false_positive: '误报' }
export const findingStatusRequestSchema = requestSchema.extend({ findingId: z.string().min(1).max(2000), status: findingStatusSchema }).strict()
export type FindingStatusRequest = z.infer<typeof findingStatusRequestSchema>
export const findingSchema = z.object({
  id: z.string(), taskId: z.string(), title: z.string(), summary: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info', 'unknown']),
  locations: z.array(z.object({ path: z.string(), startLine: z.number().optional(), endLine: z.number().optional() })),
  remediation: z.string(), validation: z.string(), attackPath: z.string(), evidence: z.string(),
  firstSeen: z.string(), lastSeen: z.string(), occurrences: z.number().int().positive(),
  status: findingStatusSchema.default('new'),
})
export type Finding = z.infer<typeof findingSchema>
export const dashboardSchema = z.object({ workspace: z.string(), tasks: z.array(taskSchema),
  findings: z.array(findingSchema), warnings: z.array(z.string()),
  capabilities: z.object({ findingStatusEditing: z.boolean() }).default({ findingStatusEditing: false }),
  selection: z.object({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional(), ultra: z.boolean().optional() }).nullable(),
})
export type Dashboard = z.infer<typeof dashboardSchema>
export const modelsSchema = z.array(z.object({ provider: z.string(), model: z.string(), label: z.string(), efforts: z.array(z.string()), ultra: z.boolean().optional() }))
export type Models = z.infer<typeof modelsSchema>
export const active = (task: Task | null): boolean => !!task && ['starting', 'running', 'cancelling'].includes(task.status)

export interface SecurityRemote {
  state(request: Request): Promise<RemoteResult<State>>
  start(request: StartRequest): Promise<RemoteResult<State>>
  cancel(request: DetailRequest): Promise<RemoteResult<State>>
  details(request: DetailRequest): Promise<RemoteResult<Details>>
  dashboard(request: Request): Promise<RemoteResult<Dashboard>>
  models(request: Request): Promise<RemoteResult<Models>>
  setFindingStatus(request: FindingStatusRequest): Promise<RemoteResult<Dashboard>>
}
