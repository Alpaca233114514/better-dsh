import { realpath } from 'node:fs/promises'
import { relative, isAbsolute } from 'node:path'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { SecurityManager } from './manager.ts'
import type { Workbench } from './workbench.ts'

export async function scanWorkspace(cwd: string | undefined, stateDirectory: string) {
  if (!cwd) throw new Error('请先在 DSH 中打开工作区会话。')
  const workspace = await realpath(cwd)
  const nested = relative(workspace, stateDirectory)
  if (nested === '' || (!nested.startsWith('..') && !isAbsolute(nested))) {
    throw new Error('Security 状态目录须位于被扫描工作区之外。')
  }
  return workspace
}

const output = {
  schema: { type: 'string' as const },
  render: (_args: unknown, text: string) => [{ type: 'text' as const, text }],
}

export function securityTools(manager: SecurityManager, workbench: Workbench) {
  const workspaceOf = (exec: ToolRunContext) => {
    exec.signal.throwIfAborted()
    return scanWorkspace(exec.agent?.session.header.cwd, workbench.stateDirectory)
  }
  return [
    defineTool({
      name: 'security_scan',
      presentCall: () => ({ card: 'generic', title: 'DeepSeek Security · 扫描工作区', kind: 'read' }),
      description: 'Run DeepSeek Security Standard static security audit when requested, including @deepseek-security followed by a scan request. Pass the user request, focus and exclusions in instructions; never discard the text after the mention. A mention alone does not request a scan. Use security_report for existing results, and explain unsupported requests instead of converting them to a full scan. Uses the current workspace and DSH model quota. No source edits, network attacks, dynamic exploits, diff scans or Deep Scan. Waits for a verified report; chat Stop cancels the scan. Real progress appears above the composer automatically. No separate start button is needed.',
      parameters: { instructions: { type: 'string', description: 'The user security scan request, including requested focus and exclusions.', required: true } }, output,
      execute: async ({ instructions }, exec) => {
        if (!instructions.trim()) throw new Error('请传入用户的扫描需求。')
        const workspace = await workspaceOf(exec)
        const agent = exec.agent!
        const { provider, model, reasoningEffort } = agent.options
        if (!provider || !model) throw new Error('请先为当前会话选择 DSH 模型。')
        exec.signal.throwIfAborted()
        const { task } = await manager.start(workspace, agent.session.id, provider, model, reasoningEffort, instructions)
        const finished = await manager.wait(workspace, task!.id, exec.signal)
        if (finished.status !== 'completed' || !finished.scanId) {
          throw new Error(finished.error || `Security scan ${finished.status}`)
        }
        const details = await workbench.details(finished.scanId)
        exec.signal.throwIfAborted()
        return `DeepSeek Security · Standard 静态审计\n报告：${finished.reportPath}\n\n${details.report}`
      },
    }),
    defineTool({
      name: 'security_report',
      presentCall: () => ({ card: 'generic', title: 'DeepSeek Security · 查看报告', kind: 'read' }),
      description: 'Read the latest DeepSeek Security task status and completed report for the current workspace without starting a new scan. Use when asked for previous scan results or progress.',
      parameters: {}, output,
      execute: async (_args, exec) => {
        const { task } = await manager.state(await workspaceOf(exec))
        exec.signal.throwIfAborted()
        if (!task) return '当前工作区还没有安全扫描记录。'
        if (task.status !== 'completed' || !task.scanId) {
          return JSON.stringify({ status: task.status, phase: task.phase, findings: task.findings, error: task.error })
        }
        const details = await workbench.details(task.scanId)
        exec.signal.throwIfAborted()
        return `报告：${task.reportPath}\n\n${details.report}`
      },
    }),
  ]
}
