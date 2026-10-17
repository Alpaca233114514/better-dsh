import { isAbsolute, relative, resolve } from 'node:path'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Task } from './contracts.ts'
import type { RunHooks } from './manager.ts'

type Activity = NonNullable<Task['activity']>
type Change = Parameters<RunHooks['update']>[0]
type Inspection = { activity: Activity; target?: string }

/** Observe event metadata only. Never retain model text, search queries or tool output. */
export class ScanActivity {
  private current?: Activity
  private target?: string
  private publishedAt = -Infinity
  private pending = new Map<string, Inspection>()
  private read = new Set<string>()
  private searches = 0
  constructor(private workspace: string, private now: () => number = Date.now) {}

  private publish(activity: Activity, target?: string, force = false): Change | undefined {
    const now = this.now()
    // Stream chunks can arrive many times a second. Persist real signals at most
    // once per second unless the action/target changes, without a synthetic timer.
    if (!force && activity === this.current && target === this.target && now - this.publishedAt < 1000) return
    this.current = activity
    this.target = target
    this.publishedAt = now
    return { activity, activityTarget: target, lastActivityAt: new Date(now).toISOString(),
      filesRead: this.read.size, searches: this.searches }
  }

  stream(frame: AssistantStreamFrame): Change | undefined {
    if (frame.type === 'start') return this.publish('waiting_response', undefined, true)
    if (frame.type !== 'chunk') return
    const chunk = frame.chunk
    if (chunk.type === 'reasoning-delta' && chunk.text) return this.publish('thinking')
    if (chunk.type === 'text-delta' && chunk.text) return this.publish('responding')
    if (chunk.type === 'tool-call-delta') return this.publish('preparing_tool')
    if (chunk.type === 'finish' && chunk.reason.kind === 'error') return this.publish('request_failed')
  }

  private targetOf(name: string, raw: string): string | undefined {
    try {
      const args = JSON.parse(raw)
      const value = name === 'read' ? args.file_path : args.path ?? '.'
      if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f]/.test(value)) return
      const path = relative(this.workspace, resolve(this.workspace, value))
      if (path === '..' || path.startsWith('..\\') || path.startsWith('../') || isAbsolute(path)) return
      return path.replaceAll('\\', '/') || '.'
    } catch { return undefined }
  }

  event(event: SessionEvent): Change | undefined {
    if (event.type === 'tool/call') {
      const { name, callId, arguments: args } = event.data
      const activity = name === 'read' || name === 'glob' || name === 'grep' ? name
        : name === 'record_codex_security_scan_draft' ? 'saving'
        : name === 'complete_codex_security_scan' ? 'reporting' : undefined
      if (!activity) return
      const target = ['read', 'glob', 'grep'].includes(name) ? this.targetOf(name, args) : undefined
      this.pending.set(callId, { activity, target })
      return this.publish(activity, target, true)
    }
    if (event.type === 'tool/result') {
      const { toolCallId, isError } = event.data.message
      const call = this.pending.get(toolCallId)
      if (!call) return
      this.pending.delete(toolCallId)
      if (!isError) {
        if (call.activity === 'read' && call.target) this.read.add(call.target)
        if (call.activity === 'glob' || call.activity === 'grep') this.searches++
      }
      const next = this.pending.values().next().value as Inspection | undefined
      return this.publish(next?.activity ?? 'processing_results', next?.target, true)
    }
  }
}
