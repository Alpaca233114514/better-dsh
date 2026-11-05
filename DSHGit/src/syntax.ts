import { common, createLowlight } from 'lowlight'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import powershell from 'highlight.js/lib/languages/powershell'
import type { RootContent } from 'hast'

const highlighter = createLowlight({ ...common, dockerfile, powershell })
const languages: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyw: 'python', sh: 'bash', bash: 'bash', zsh: 'bash',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini',
  css: 'css', scss: 'scss', less: 'less', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  kt: 'kotlin', kts: 'kotlin', java: 'java', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
  go: 'go', rs: 'rust', rb: 'ruby', php: 'php', swift: 'swift', lua: 'lua', sql: 'sql', md: 'markdown',
}
export type SyntaxToken = { text: string; className: string }
type Row = { index: number; code: string }

export function highlightDiff(text: string, path: string): Map<number, SyntaxToken[]> {
  const result = new Map<number, SyntaxToken[]>()
  const filename = path.split('/').pop()?.toLowerCase() ?? ''
  const language = filename === 'dockerfile' ? 'dockerfile' : filename === 'makefile' ? 'makefile'
    : languages[filename.split('.').pop() ?? '']
      ?? (/^[+ ]#!.*\b(?:ba|z)?sh\b/m.test(text) ? 'bash' : undefined)
  if (!language || text.length > 300_000) return result
  const paint = (rows: Row[]) => {
    if (!rows.length) return
    const tree = highlighter.highlight(language, rows.map(row => row.code).join('\n'))
    const lines: SyntaxToken[][] = [[]]
    const visit = (node: RootContent, classes: string[]) => {
      if (node.type === 'element') {
        const names = node.properties.className
        const next = Array.isArray(names) ? [...classes, ...names.map(String)] : classes
        for (const child of node.children) visit(child, next)
      } else if (node.type === 'text') {
        node.value.split('\n').forEach((part, index) => {
          if (index) lines.push([])
          if (part) lines.at(-1)!.push({ text: part, className: classes.join(' ') })
        })
      }
    }
    for (const child of tree.children) visit(child, [])
    rows.forEach((row, index) => result.set(row.index, lines[index] ?? []))
  }
  let before: Row[] = [], after: Row[] = [], inHunk = false
  const flush = () => { paint(before); paint(after); before = []; after = [] }
  // Tokenize each side together so multiline strings/comments retain their state.
  // 分别解析每个差异块的新旧代码，避免增删行破坏多行字符串和注释。
  text.split('\n').forEach((line, index) => {
    if (line.startsWith('diff --git ')) { flush(); inHunk = false }
    else if (line.startsWith('@@ ')) { flush(); inHunk = true }
    else if (inHunk) {
      const row = { index, code: line.slice(1) }
      if (line[0] === ' ' || line[0] === '-') before.push(row)
      if (line[0] === ' ' || line[0] === '+') after.push(row)
    }
  })
  flush()
  return result
}
