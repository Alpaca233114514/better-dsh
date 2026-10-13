import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { requestSchema, stateSchema, detailsSchema, type SecurityRemote } from './contracts.ts'

// A small explicit public Typert contribution, shared verbatim by both faces.
// Strict schemas validate the same shapes used by this package's exported API.
export const contribution: TypertRemoteContribution = {
  package: '@better-dsh/deepseek-security',
  descriptors: (['state', 'start', 'cancel', 'details'] as const).map((method): InvocationDescriptor => ({
    id: `@better-dsh/deepseek-security#${method}`, service: 'deepseekSecurity', namespace: 'deepseekSecurity', method,
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json',
      codec: { mode: 'strict', typeSymbol: 'SecurityRequest', create: () => requestSchema } }],
    result: { mode: 'strict', typeSymbol: method === 'details' ? 'SecurityDetails' : 'SecurityState',
      create: () => method === 'details' ? detailsSchema : stateSchema },
  })),
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { deepseekSecurity: SecurityRemote }
}
