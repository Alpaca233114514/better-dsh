import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { requestSchema, startSchema, detailRequestSchema, findingStatusRequestSchema, findingRequestSchema, repairResultSchema, stateSchema, detailsSchema, dashboardSchema, modelsSchema, type SecurityRemote } from './contracts.ts'

// A small explicit public Typert contribution, shared verbatim by both faces.
// Strict schemas validate the same shapes used by this package's exported API.
export const contribution: TypertRemoteContribution = {
  package: '@better-dsh/deepseek-security',
  descriptors: (['state', 'start', 'cancel', 'details', 'dashboard', 'models', 'setFindingStatus', 'repairFinding'] as const).map((method): InvocationDescriptor => ({
    id: `@better-dsh/deepseek-security#${method}`, service: 'deepseekSecurity', namespace: 'deepseekSecurity', method,
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json',
      codec: { mode: 'strict', typeSymbol: method === 'repairFinding' ? 'SecurityFindingRequest' : method === 'setFindingStatus' ? 'SecurityFindingStatusRequest' : method === 'start' ? 'SecurityStartRequest' : method === 'details' || method === 'cancel' ? 'SecurityDetailRequest' : 'SecurityRequest',
        create: () => method === 'repairFinding' ? findingRequestSchema : method === 'setFindingStatus' ? findingStatusRequestSchema : method === 'start' ? startSchema : method === 'details' || method === 'cancel' ? detailRequestSchema : requestSchema } }],
    result: { mode: 'strict', typeSymbol: method === 'repairFinding' ? 'SecurityRepairResult' : method === 'details' ? 'SecurityDetails' : method === 'dashboard' || method === 'setFindingStatus' ? 'SecurityDashboard' : method === 'models' ? 'SecurityModels' : 'SecurityState',
      create: () => method === 'repairFinding' ? repairResultSchema : method === 'details' ? detailsSchema : method === 'dashboard' || method === 'setFindingStatus' ? dashboardSchema : method === 'models' ? modelsSchema : stateSchema },
  })),
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { deepseekSecurity: SecurityRemote }
}
