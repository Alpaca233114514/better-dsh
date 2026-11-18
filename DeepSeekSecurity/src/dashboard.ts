import { findingSchema, type Finding, type Task } from './contracts.ts'
import type { Details } from './contracts.ts'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2)

/** 同一指纹跨扫描合并；缺席不代表修复。 Merge identities; absence never proves a fix. */
export function projectFindings(scans: { task: Task; details: Details }[]): Finding[] {
  const found = new Map<string, Finding>()
  for (const { task, details } of [...scans].sort((a, b) => a.task.startedAt.localeCompare(b.task.startedAt))) {
    const artifact = object(JSON.parse(details.findings))
    if (!Array.isArray(artifact.findings)) throw new Error('安全报告缺少 findings 数组。')
    const seen = new Set<string>()
    for (const raw of artifact.findings) {
      const item = object(raw)
      const id = text(object(item.fingerprints).primary) || text(item.findingId)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const previous = found.get(id)
      const severity = text(object(item.severity).level).toLowerCase()
      const value = findingSchema.parse({
        id, taskId: task.id, title: text(item.title), summary: text(item.summary),
        severity: ['critical', 'high', 'medium', 'low', 'info'].includes(severity) ? severity : 'unknown',
        locations: Array.isArray(item.locations) ? item.locations.map(raw => {
          const location = object(raw)
          return { path: text(location.path), startLine: location.startLine, endLine: location.endLine }
        }) : [],
        remediation: text(item.remediation), validation: text(item.validation), attackPath: text(item.attackPath),
        evidence: text(item.codeEvidence ?? item.code_evidence ?? item.rootCause ?? item.root_cause),
        firstSeen: previous?.firstSeen ?? task.startedAt, lastSeen: task.startedAt,
        occurrences: (previous?.occurrences ?? 0) + 1,
      })
      found.set(id, value)
    }
  }
  const order = ['critical', 'high', 'medium', 'low', 'info', 'unknown']
  return [...found.values()].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.lastSeen.localeCompare(a.lastSeen))
}
