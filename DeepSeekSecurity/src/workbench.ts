import { spawn } from 'node:child_process'
import { readFile, realpath, mkdir } from 'node:fs/promises'
import { dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScanArtifactContext } from '../vendor/codex-security/mcp-app/src/artifact-context.js'
import { recordCodexSecurityScanDraftViaWorkbench, scanDraftInputSchema } from '../vendor/codex-security/mcp-app/src/artifact-scan-draft.js'
import type { Phase } from './contracts.ts'

export const pluginRoot = fileURLToPath(new URL('../vendor/codex-security/', import.meta.url))
export type ObjectValue = Record<string, unknown>
export function record(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid workbench response')
  return value as ObjectValue
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing workbench value')
  return value
}

/** Calls the vendored persistence/report helper, never cs/codex-security/Codex. */
export class Workbench {
  constructor(readonly stateDirectory: string, readonly python: string) {
    if (!isAbsolute(stateDirectory)) throw new Error('Security stateDirectory must be absolute')
  }

  async run(args: string[], input?: string | Buffer): Promise<ObjectValue> {
    await mkdir(this.stateDirectory, { recursive: true })
    const env = { ...process.env, CODEX_SECURITY_STATE_DIR: this.stateDirectory, PYTHONUTF8: '1' }
    // A fixed helper and argv array; no shell, CLI model runtime, or persistent service.
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, ['-I', '-X', 'utf8', join(pluginRoot, 'scripts/workbench_db.py'), ...args], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env,
      })
      let stdout = '', stderr = ''
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) return reject(new Error(stderr.trim() || `Security workbench exited ${code}`))
        try { resolve(record(JSON.parse(stdout))) } catch (error) { reject(error) }
      })
      child.stdin.on('error', () => { /* Process exit reports the authoritative error. */ })
      child.stdin.end(input)
    })
  }

  async start(workspace: string, threadId: string, model: string): Promise<ObjectValue> {
    const result = await this.run(['start-headless-standard-scan', '--thread-id', threadId,
      '--target-path', workspace, '--scope', '.', '--model', model])
    return record(result.scan)
  }

  async context(scanId: string) {
    return createScanArtifactContext(scanId, this.run.bind(this), {
      requireRunning: true, pluginRoot, pythonCommand: this.python,
    })
  }

  async draft(scanId: string, value: unknown, signal: AbortSignal) {
    signal.throwIfAborted()
    const parsed = scanDraftInputSchema.parse(value)
    if (parsed.scanId !== scanId) throw new Error('Draft belongs to a different scan')
    const context = await this.context(scanId)
    if (parsed.handoffClaimToken && parsed.handoffClaimToken !== context.handoffClaimToken) {
      throw new Error('Draft belongs to a different continuation')
    }
    return recordCodexSecurityScanDraftViaWorkbench(context,
      { ...parsed, handoffClaimToken: context.handoffClaimToken }, this.run.bind(this), signal)
  }

  async progress(scanId: string, phase: Phase, claim: string) {
    return this.run(['update-progress', '--scan-id', scanId, '--phase', phase, '--claim-token', claim])
  }

  async complete(scanId: string, claim: string) {
    await this.run(['complete-scan', '--scan-id', scanId, '--claim-token', claim])
    return this.get(scanId)
  }

  async get(scanId: string) {
    return record((await this.run(['get-scan', '--scan-id', scanId])).scan)
  }

  async stop(scanId: string, cancelled: boolean, message: string) {
    const scan = await this.get(scanId)
    if (record(scan.progress).status !== 'running') return
    await this.run(cancelled
      ? ['cancel-scan', '--scan-id', scanId]
      : ['fail-scan', '--scan-id', scanId, '--message', message, '--claim-token', string(scan.handoffClaimToken)])
  }

  async details(scanId: string) {
    const scan = await this.get(scanId)
    const root = await realpath(string(scan.scanDir))
    // Artifact locations come from the host-owned workbench, never from the model or Client.
    const read = async (name: string) => readFile(join(root, name), 'utf8')
    return { report: await read('report.md'), findings: await read('findings.json'),
      threatModel: await read('threatmodel.md').catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return ''
        throw e
      }) }
  }
}
