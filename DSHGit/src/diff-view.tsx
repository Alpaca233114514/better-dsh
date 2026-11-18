import { useMemo } from 'react'
import { highlightDiff } from './syntax.ts'

export function DiffContent({ text, path }: { text: string; path: string }) {
  const highlighted = useMemo(() => highlightDiff(text, path), [text, path])
  // Hunk coordinates advance separately; 增删行分别推进新旧文件行号。
  let oldLine = 0
  let newLine = 0
  let inHunk = false

  return (
    <pre aria-label="文件差异内容">
      {text.split('\n').map((line, index) => {
        const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
        if (hunk) {
          oldLine = Number(hunk[1])
          newLine = Number(hunk[2])
          inHunk = true
        }
        if (line.startsWith('diff --git ')) inHunk = false
        if (/^(diff --git |index |--- |\+\+\+ )/.test(line) && !inHunk) return null

        const added = inHunk && line.startsWith('+')
        const removed = inHunk && line.startsWith('-')
        const context = inHunk && line.startsWith(' ')
        const before = removed || context ? oldLine++ : ''
        const after = added || context ? newLine++ : ''
        const tokens = highlighted.get(index)
        const lineClass = hunk ? ' dg-hunk' : added ? ' dg-added' : removed ? ' dg-removed' : ''

        return (
          <span key={index} className={`dg-code-line${lineClass}`}>
            <span className="dg-line-number" aria-hidden="true">
              {before}
            </span>
            <span className="dg-line-number" aria-hidden="true">
              {after}
            </span>
            <code>
              {tokens ? (
                <>
                  <span className="dg-diff-marker">{line[0]}</span>
                  {tokens.map((token, tokenIndex) => (
                    <span key={tokenIndex} className={token.className || undefined}>
                      {token.text}
                    </span>
                  ))}
                </>
              ) : (
                line || ' '
              )}
            </code>
          </span>
        )
      })}
    </pre>
  )
}
