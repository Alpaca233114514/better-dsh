import { z } from 'zod'
export const requestSchema = z.object({ action: z.enum(['sync', 'poll', 'hide']), owner: z.string().min(1).max(100), state: z.object({ svg: z.string().max(100000), name: z.string().max(48), enabled: z.boolean(), animated: z.boolean(), size: z.number().min(72).max(180), status: z.enum(['idle', 'running', 'waiting', 'completed', 'failed']), dark: z.boolean(), text: z.string().max(1000), notices: z.array(z.string().max(1000)).max(5) }).optional() }).strict()
export const resultSchema = z.object({ available: z.boolean(), message: z.string(), actions: z.array(z.enum(['chat', 'voice', 'notifications'])) })
export const contribution = { package: 'dsh-pet-manager', descriptors: [{
  id: 'dsh-pet-manager#run', service: 'petManager', namespace: 'petManager', method: 'run', invocation: { kind: 'direct' },
  parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'PetRequest', schema: requestSchema, create: () => requestSchema } }],
  result: { mode: 'strict', typeSymbol: 'PetResult', schema: resultSchema, create: () => resultSchema },
}] }
