import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'

export const securityMention = '@deepseek-security'
// The transcript and clipboard contain the same stable, whitespace-free mention.
// Tool routing instructions belong to the host tool descriptions, not user text.
export const securityContext = `${securityMention} `

export const source: InputTriggerSource = {
  trigger: '@', name: 'deepseek-security', order: -10, showGroupTitle: false,
  candidates: async (_session, request) => request.quoted || request.drilled ? [] : [{
    name: 'deepseek-security', description: '静态安全审计',
  }],
  onPick: () => ({ insert: {
    source: 'deepseek-security', ref: securityMention,
    label: 'deepseek-security', clipboardText: securityMention,
  } }),
  codec: {
    clipboardText: () => securityMention,
    async serialize(_ref, signal) { signal.throwIfAborted(); return securityContext },
  },
}
