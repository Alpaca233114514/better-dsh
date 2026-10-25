const success = new Set(['stop', 'tool-calls', 'max-tokens'])
const numeric = x => typeof x === 'number' && Number.isFinite(x)
export const features = ['contextTokens', 'cacheHitRatio', 'outputTokens', 'reasoningTokens', 'messageJsonBytes', 'toolSchemaBytes',
  'messageCount', 'toolCount', 'maxConcurrent', 'processCpuMs', 'processElu', 'consumerWaitMs', 'gapMaxMs']

export function correlation(rows, x, y = 'decodeTps') {
  const pairs = rows.filter(r => numeric(r[x]) && numeric(r[y]))
  const n = pairs.length
  if (n < 3) return { n, pearson: null }
  const mx = pairs.reduce((s, r) => s + r[x], 0) / n, my = pairs.reduce((s, r) => s + r[y], 0) / n
  let xx = 0, yy = 0, xy = 0
  for (const r of pairs) { const a = r[x] - mx, b = r[y] - my; xx += a * a; yy += b * b; xy += a * b }
  return { n, pearson: xx > 0 && yy > 0 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null }
}
function stats(rows) {
  const mean = key => { const xs = rows.map(r => r[key]).filter(numeric); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null }
  const tokens = rows.reduce((s, r) => s + r.outputTokens, 0), ms = rows.reduce((s, r) => s + r.decodeMs, 0)
  const speeds = rows.map(r => r.decodeTps).sort((a, b) => a - b), middle = Math.floor(speeds.length / 2)
  return { n: rows.length, meanContextTokens: mean('contextTokens'), meanTtftMs: mean('ttftMs'),
    weightedDecodeTps: ms > 0 ? tokens * 1000 / ms : null,
    medianDecodeTps: speeds.length ? speeds.length % 2 ? speeds[middle] : (speeds[middle - 1] + speeds[middle]) / 2 : null }
}
export function analyze(records) {
  const calls = records.filter(r => r.kind === 'call-end'), starts = new Set(records.filter(r => r.kind === 'call-start').map(r => r.callId))
  for (const c of calls) starts.delete(c.callId)
  const eligible = calls.filter(r => success.has(r.status) && numeric(r.outputTokens) && r.outputTokens > 0 && numeric(r.decodeTps) && r.decodeMs > 0)
  const groups = new Map()
  for (const r of eligible) {
    const key = JSON.stringify([r.provider, r.model, r.reasoningEffort, r.purpose])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const results = [...groups].map(([key, rows]) => {
    const [provider, model, reasoningEffort, purpose] = JSON.parse(key)
    const bins = new Map()
    for (const r of rows) {
      if (!numeric(r.contextTokens)) continue
      const lower = Math.floor(r.contextTokens / 8192) * 8192
      if (!bins.has(lower)) bins.set(lower, [])
      bins.get(lower).push(r)
    }
    return { provider, model, reasoningEffort, purpose, ...stats(rows),
      correlations: Object.fromEntries(features.map(f => [f, correlation(rows, f)])),
      contextBins: [...bins].sort((a, b) => a[0] - b[0]).map(([lower, rs]) => ({ lower, upperExclusive: lower + 8192, ...stats(rs) })) }
  })
  return { totalCalls: calls.length, eligibleCalls: eligible.length, excludedCalls: calls.length - eligible.length,
    unfinishedCalls: starts.size, retries: records.filter(r => r.kind === 'retry').length,
    toolsCompleted: records.filter(r => r.kind === 'tool-end').length,
    dataLossRecords: records.filter(r => r.kind === 'data-loss').length,
    statuses: Object.fromEntries([...new Set(calls.map(r => r.status))].map(s => [s, calls.filter(r => r.status === s).length])), groups: results }
}

const format = x => numeric(x) ? x.toFixed(3) : '—'
// Neutralize spreadsheet formula interpretation without changing JSON evidence.
export function csv(rows) {
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].sort()
  const cell = value => {
    let s = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(s)) s = "'" + s
    return '"' + s.replaceAll('"', '""') + '"'
  }
  return '\uFEFF' + keys.map(cell).join(',') + '\r\n' + rows.map(r => keys.map(k => cell(r[k])).join(',')).join('\r\n') + '\r\n'
}
const safe = s => String(s ?? '未报告').replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('\r', ' ')
export function markdown(report) {
  const lines = ['# DSH 输出速度观察报告', '',
    `已完成 ${report.totalCalls} 次请求；速度分析纳入 ${report.eligibleCalls} 次，排除 ${report.excludedCalls} 次；未结束 ${report.unfinishedCalls} 次。`,
    `重试事件 ${report.retries} 次，工具结果 ${report.toolsCompleted} 次，数据丢失告警 ${report.dataLossRecords} 条。`, '',
    '按 provider / model / reasoningEffort / purpose 分组。仅纳入成功且具有输出用量、正生成时长的请求；失败与取消保留在 CSV。', '',
    'TPS = 提供方 outputTokens ÷（首个非空正文/推理/工具增量至 finish 的秒数）。推理已包含在输出中。',
    '这是客户端观察速度，包含流中停顿和下游处理；未测量服务端纯解码时间。chunk 不等于 token。', '',
    '相关性不能证明因果。小样本、同会话重复测量、输出长度、时段、并发和缓存均可能混杂；进程 CPU/ELU/RSS 是整个 DSH 进程的指标。',
    'gapMaxMs、consumerWaitMs 与 TPS 共享时间组成，相关性含数学耦合，不能据此推断性能瓶颈。', '']
  for (const g of report.groups) {
    lines.push(`## ${safe(g.provider)} / ${safe(g.model)} / ${safe(g.reasoningEffort)} / ${safe(g.purpose)}`, '',
      `样本 ${g.n}；加权 TPS ${format(g.weightedDecodeTps)}；中位 TPS ${format(g.medianDecodeTps)}；平均 TTFT ${format(g.meanTtftMs)} ms。`, '',
      '| 变量 | 有效样本 | 与 TPS 的 Pearson r |', '| --- | ---: | ---: |')
    for (const [f, c] of Object.entries(g.correlations)) lines.push(`| ${f} | ${c.n} | ${format(c.pearson)} |`)
    lines.push('', '| 上下文 token 区间 | 样本 | 加权 TPS | 平均 TTFT ms |', '| --- | ---: | ---: | ---: |')
    for (const b of g.contextBins) lines.push(`| ${b.lower}–${b.upperExclusive - 1} | ${b.n} | ${format(b.weightedDecodeTps)} | ${format(b.meanTtftMs)} |`)
    lines.push('')
  }
  return lines.join('\n')
}
