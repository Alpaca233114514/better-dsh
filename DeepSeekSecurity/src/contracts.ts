import { z } from 'zod'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

export const phases = ['preflight', 'threat_model', 'discovery', 'validation', 'attack_path', 'reporting'] as const
export type Phase = typeof phases[number]
export const preflightStages = ['checking_workspace', 'inventory', 'snapshot', 'registering'] as const
export const stages = [...preflightStages, 'initializing', 'awaiting_model',
  'threat_model', 'discovery', 'validation', 'attack_path', 'reporting'] as const
export type Stage = typeof stages[number]
export const workbenchProgressSchema = z.object({
  stage: z.enum(preflightStages), files: z.number().int().nonnegative().optional(),
})
export const taskSchema = z.object({
  id: z.string(), workspace: z.string(), sessionId: z.string(), scanId: z.string().optional(),
  status: z.enum(['starting', 'running', 'cancelling', 'completed', 'failed', 'cancelled', 'interrupted']),
  phase: z.enum(phases), startedAt: z.string(), updatedAt: z.string(),
  stage: z.enum(stages).optional(), stageStartedAt: z.string().optional(),
  completedStages: z.array(z.enum(stages)).optional(), files: z.number().int().nonnegative().optional(),
  activity: z.enum(['model', 'waiting_response', 'thinking', 'responding', 'preparing_tool',
    'processing_results', 'request_failed', 'read', 'glob', 'grep', 'saving', 'reporting']).optional(),
  activityAt: z.string().optional(), lastActivityAt: z.string().optional(), activityTarget: z.string().optional(),
  filesRead: z.number().int().nonnegative().optional(), searches: z.number().int().nonnegative().optional(),
  provider: z.string(), model: z.string(), findings: z.number().int().nonnegative(),
  reasoningEffort: z.string().optional(),
  instructions: z.string().optional(),
  completed: z.number().int().nonnegative().optional(), total: z.number().int().nonnegative().optional(),
  error: z.string().optional(), reportPath: z.string().optional(),
})
export type Task = z.infer<typeof taskSchema>
export const stateSchema = z.object({ workspace: z.string(), task: taskSchema.nullable() })
export type State = z.infer<typeof stateSchema>
export const requestSchema = z.object({ sessionId: z.string().min(1) }).strict()
export type Request = z.infer<typeof requestSchema>
export const detailsSchema = z.object({ report: z.string(), findings: z.string(), threatModel: z.string() })
export type Details = z.infer<typeof detailsSchema>
export const active = (task: Task | null): boolean => !!task && ['starting', 'running', 'cancelling'].includes(task.status)

export interface SecurityRemote {
  state(request: Request): Promise<RemoteResult<State>>
  start(request: Request): Promise<RemoteResult<State>>
  cancel(request: Request): Promise<RemoteResult<State>>
  details(request: Request): Promise<RemoteResult<Details>>
}
