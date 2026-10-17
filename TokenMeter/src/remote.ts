import { z } from 'zod'

const bucket = z.object({ input: z.number(), cacheRead: z.number(), cacheWrite: z.number(), output: z.number(), total: z.number() })
export const stateSchema = z.object({
  cumulative: bucket, today: bucket, peakRoundTokens: z.number(), peakRoundDate: z.string().nullable(),
  longestRoundMs: z.number(), longestRoundDate: z.string().nullable(),
  daily: z.record(z.string(), z.object({ input: z.number(), cache: z.number(), cacheWrite: z.number().optional(), output: z.number() })),
  generatedAt: z.number(), persistenceError: z.string().nullable(),
})
export const contribution = {
  package: 'dsh-token-meter-dashboard', descriptors: ['state', 'reset'].map(method => ({
    id: `tokenMeterDashboard#${method}`, service: 'tokenMeterDashboard', namespace: 'tokenMeterDashboard', method,
    invocation: { kind: 'direct' }, parameters: [],
    result: { mode: 'strict', typeSymbol: 'TokenMeterDashboardState', create: () => stateSchema },
  })),
}
