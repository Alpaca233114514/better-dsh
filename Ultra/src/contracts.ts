import { z } from 'zod';

export const routeSchema = z.object({ provider: z.string().min(1), model: z.string().min(1), reasoningEffort: z.string().min(1).optional() }).strict();
export const childSchema = z.object({ id: z.string(), runId: z.string(), label: z.string(), provider: z.string(), model: z.string(), effort: z.string(), status: z.enum(['running', 'completed', 'cancelled', 'failed', 'interrupted']) }).strict();
export const storedSchema = z.object({
  inheritedEventCount: z.number().int().nonnegative(), revision: z.number().int(),
  enabled: z.boolean(), route: routeSchema.nullable(), managed: z.boolean(), effort: z.string().nullable(),
  children: z.array(childSchema),
}).strict();
export const viewSchema = z.object({
  enabled: z.boolean(), available: z.boolean(), running: z.boolean(), route: routeSchema.nullable(), revision: z.number().int(),
  children: z.array(childSchema),
}).strict();
export const selectSchema = z.object({ sessionId: z.string().min(1), selection: routeSchema, ultra: z.boolean() }).strict();
export const sessionSchema = z.string().min(1);
export type Stored = z.infer<typeof storedSchema>;
export type View = z.infer<typeof viewSchema>;
export type Child = z.infer<typeof childSchema>;
export type Selection = z.infer<typeof routeSchema>;
export type SelectRequest = z.infer<typeof selectSchema>;

export function supportsUltra(group: { id: string }, model: { id: string; name?: string; reasoning?: { efforts: readonly { id: string }[] } }) {
  return /deepseek/i.test(`${group.id} ${model.id} ${model.name ?? ''}`)
    && model.reasoning?.efforts.some(e => e.id === 'max') === true
    && !model.reasoning.efforts.some(e => e.id === 'ultra');
}

export const emptyView: View = Object.freeze({ enabled: false, available: false, running: false, route: null, revision: -1, children: [] });

export const contribution = {
  package: 'dsh-ultra',
  descriptors: [
    { id: 'dsh-ultra#select', service: 'dshUltra', namespace: 'dshUltra', method: 'select', invocation: { kind: 'direct' },
      parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'UltraSelect', create: () => selectSchema } }],
      result: { mode: 'strict', typeSymbol: 'UltraView', create: () => viewSchema } },
    { id: 'dsh-ultra#follow', service: 'dshUltra', namespace: 'dshUltra', method: 'follow', mode: 'stream', invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'UltraSession', create: () => sessionSchema } }],
      cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: 'UltraView', create: () => viewSchema } },
  ],
} as const;
