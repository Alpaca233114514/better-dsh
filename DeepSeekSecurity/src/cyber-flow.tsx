import { findingStatuses, findingStatusLabels, severityOrder, type Finding } from './contracts.ts'
import { SeverityBadge, severityNames } from './cyber-shared.tsx'

function buildFlowLayout(findings: Finding[]) {
  const groups = severityOrder
    .map(severity => ({ severity, count: findings.filter(f => f.severity === severity).length }))
    .filter(group => group.count > 0)

  const statuses = findingStatuses
    .map(status => {
      const matching = findings.filter(finding => finding.status === status)
      const rank = matching.reduce((sum, finding) => sum + severityOrder.indexOf(finding.severity), 0) / (matching.length || 1)
      return { status, count: matching.length, rank }
    })
    .filter(group => group.count > 0)
    .sort((a, b) => a.rank - b.rank)

  const height = Math.max(160, Math.max(groups.length, statuses.length) * 64 + 24)
  const position = (index: number, count: number) =>
    count === 1 ? height / 2 : 32 + index * ((height - 64) / (count - 1))
  const scale = 36 / findings.length

  let left = height / 2 - (36 + (groups.length - 1) * 6) / 2
  const nodes = groups.map((group, index) => {
    const y = position(index, groups.length)
    const width = group.count * scale
    const origin = left + width / 2
    left += width + 6
    return { ...group, y, width, origin }
  })

  const targets = statuses.map((group, index) => ({
    ...group,
    y: position(index, statuses.length),
    offset: (-group.count * scale) / 2,
  }))

  const links = nodes.flatMap(node => {
    let offset = -node.width / 2
    return targets.flatMap(target => {
      const count = findings.filter(
        finding => finding.severity === node.severity && finding.status === target.status,
      ).length
      if (!count) return []
      const width = count * scale
      const from = node.y + offset + width / 2
      const to = target.y + target.offset + width / 2
      offset += width
      target.offset += width
      return [{ key: `${node.severity}-${target.status}`, severity: node.severity, status: target.status, count, from, to, width }]
    })
  })

  return { groups, statuses, height, nodes, targets, links }
}

export function FindingFlow({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null
  const recurring = findings.filter(f => f.occurrences > 1).length
  const { groups, statuses, height, nodes, targets, links } = buildFlowLayout(findings)
  const summaryLabel = links
    .map(link => `${severityNames[link.severity]}、${findingStatusLabels[link.status]} ${link.count} 项`)
    .join('；')

  return (
    <div className="cy-flow">
      <div
        className="cy-flow-diagram"
        style={{ height }}
        role="img"
        aria-label={`共 ${findings.length} 项发现，${recurring} 项跨扫描再次发现。${summaryLabel}`}
      >
        <div className="cy-flow-label cy-flow-source">
          <span>安全发现</span>
          <strong>{findings.length}</strong>
        </div>

        <svg viewBox={`0 0 400 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {nodes.map(node => (
            <path
              key={node.severity}
              d={`M0 ${node.origin} C150 ${node.origin}, 250 ${node.y}, 400 ${node.y}`}
              strokeWidth={Math.max(1, node.width)}
              className={`cy-flow-link cy-flow-${node.severity}`}
            />
          ))}
        </svg>

        <div className="cy-flow-middle">
          {nodes.map(node => (
            <div
              key={node.severity}
              className={`cy-flow-label cy-flow-severity cy-flow-${node.severity}`}
              style={{ top: node.y }}
            >
              <span>{severityNames[node.severity]}</span>
              <strong>{node.count}</strong>
            </div>
          ))}
        </div>

        <svg viewBox={`0 0 400 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {links.map(link => (
            <path
              key={link.key}
              d={`M0 ${link.from} C150 ${link.from}, 250 ${link.to}, 400 ${link.to}`}
              strokeWidth={Math.max(1, link.width)}
              className={`cy-flow-link cy-flow-${link.severity}`}
            >
              <title>
                {severityNames[link.severity]} → {findingStatusLabels[link.status]}：{link.count} 项
              </title>
            </path>
          ))}
        </svg>

        <div className="cy-flow-statuses">
          {targets.map(target => (
            <div
              key={target.status}
              className={`cy-flow-label cy-flow-target cy-finding-${target.status}`}
              style={{ top: target.y }}
            >
              <span>{findingStatusLabels[target.status]}</span>
              <strong>{target.count}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="cy-flow-compact">
        {groups.map(group => (
          <span key={group.severity}>
            <SeverityBadge severity={group.severity} />
            {group.count}
          </span>
        ))}
        {statuses.map(group => (
          <span key={group.status}>
            {findingStatusLabels[group.status]} {group.count}
          </span>
        ))}
      </div>

      <details className="cy-flow-breakdown">
        <summary>查看等级与状态分布</summary>
        <div className="cy-table-wrap">
          <table className="cy-table">
            <caption className="cy-sr-only">当前筛选结果的等级与状态交叉统计</caption>
            <thead>
              <tr>
                <th>严重程度</th>
                {statuses.map(group => (
                  <th key={group.status}>{findingStatusLabels[group.status]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.map(node => (
                <tr key={node.severity}>
                  <th scope="row">
                    <SeverityBadge severity={node.severity} />
                  </th>
                  {statuses.map(group => (
                    <td key={group.status}>
                      {links.find(link => link.severity === node.severity && link.status === group.status)?.count ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
