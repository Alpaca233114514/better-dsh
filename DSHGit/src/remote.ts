import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { requestSchema, resultSchema, type GitRemote } from './contracts.ts'
export const contribution: TypertRemoteContribution = {
  package: 'dshgit', descriptors: [{
    id: 'dshgit#run', service: 'dshgit', namespace: 'dshgit', method: 'run', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'strict', typeSymbol: 'GitRequest', create: () => requestSchema } }],
    result: { mode: 'strict', typeSymbol: 'GitResult', create: () => resultSchema },
  }],
}
declare module '@deepseek-ai/dsh-typert-protocol' { interface TypertRemoteNamespaceMap { dshgit: GitRemote } }
