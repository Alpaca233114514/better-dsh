import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'

export const securityMention = '@DeepSeek Security'
// Serialized only on Send. The editable request after the chip stays intact.
export const securityContext = `${securityMention}\nUse the DeepSeek Security plugin for the user's following request. For a Standard static workspace scan, call security_scan and pass the user's scope, focus and exclusions in instructions. For an existing result, use security_report. Do not start a scan merely because this plugin is mentioned; follow the actual request. Unsupported requests must be explained, not silently converted to a full scan.\n`

export const source: InputTriggerSource = {
  trigger: '@', name: 'deepseek-security', order: -10, showGroupTitle: false,
  candidates: async (_session, request) => request.quoted || request.drilled ? [] : [{
    name: 'DeepSeek Security', description: '静态安全审计',
  }],
  onPick: () => ({ insert: {
    source: 'deepseek-security', ref: securityMention,
    label: 'DeepSeek Security', clipboardText: securityMention,
  } }),
  codec: {
    clipboardText: () => securityMention,
    async serialize(_ref, signal) { signal.throwIfAborted(); return securityContext },
  },
}
