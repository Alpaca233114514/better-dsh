import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, matchesGlob, relative, resolve, sep } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

const maxBytes = 1024 * 1024
const maxEntries = 20000
const maxResults = 200
const output = {
  schema: { type: 'string' as const },
  render: (_args: unknown, text: string) => [{ type: 'text' as const, text }],
}
const inside = (root: string, path: string) => {
  const tail = relative(root, path)
  return tail === '' || (tail !== '..' && !tail.startsWith(`..${sep}`) && !isAbsolute(tail))
}

/** Scan-owned local readers. No shell, inherited FS backend, or link traversal. */
export async function workspaceTools(workspace: string) {
  const root = await realpath(workspace)
  const boundary = () => new Error('Security workspace boundary: outside paths and symbolic links/junctions are not readable.')
  async function checked(input: string, signal: AbortSignal) {
    signal.throwIfAborted()
    // Reject Windows device/ADS paths as well as lexical escapes before touching them.
    if (input.includes('\0') || (process.platform === 'win32' &&
      (input.startsWith('\\\\') || input.replace(/^[a-z]:/i, '').includes(':')))) throw boundary()
    const path = resolve(root, input)
    if (!inside(root, path) || await realpath(root) !== root) throw boundary()
    let cursor = root
    for (const component of relative(root, path).split(sep).filter(Boolean)) {
      cursor = join(cursor, component)
      if ((await lstat(cursor)).isSymbolicLink()) throw boundary()
    }
    const canonical = await realpath(path)
    if (!inside(root, canonical)) throw boundary()
    signal.throwIfAborted()
    return canonical
  }
  async function textFile(path: string, signal: AbortSignal) {
    const target = await checked(path, signal)
    const expected = await lstat(target)
    if (!expected.isFile()) throw new Error('Only regular text files are supported.')
    const handle = await open(target, 'r')
    try {
      const stat = await handle.stat()
      if (stat.dev !== expected.dev || stat.ino !== expected.ino) throw boundary()
      if (!stat.isFile() || stat.size > maxBytes) throw new Error('Only regular text files up to 1 MiB are supported.')
      // Check again after opening, and bound the actual read even if a file grows.
      await checked(path, signal)
      const data = Buffer.alloc(maxBytes + 1)
      let count = 0
      while (count < data.length) {
        signal.throwIfAborted()
        const { bytesRead } = await handle.read(data, count, data.length - count, count)
        if (!bytesRead) break
        count += bytesRead
      }
      if (count > maxBytes) throw new Error('File exceeds the 1 MiB text limit.')
      const bytes = data.subarray(0, count)
      if (bytes.includes(0)) throw new Error('Binary files are not supported.')
      return bytes.toString('utf8')
    } finally { await handle.close() }
  }
  async function files(input: string, signal: AbortSignal) {
    const start = await checked(input, signal)
    const result: string[] = []
    let visited = 0, truncated = false
    async function visit(path: string): Promise<void> {
      signal.throwIfAborted()
      if (++visited > maxEntries) { truncated = true; return }
      const target = await checked(path, signal)
      const stat = await lstat(target)
      if (stat.isFile()) { result.push(target); return }
      if (!stat.isDirectory()) return
      for (const entry of await readdir(target, { withFileTypes: true })) {
        // Refuse every link, including internal links. Never enumerate its target.
        if (entry.isSymbolicLink() || entry.name === '.git') continue
        await visit(join(target, entry.name))
        if (truncated) break
      }
    }
    await visit(start)
    return { paths: result, truncated }
  }
  const nameOf = (path: string) => relative(root, path).split(sep).join('/')
  const searchDescription = 'Only this workspace; no symbolic links/junctions or .git traversal. At most 20,000 entries and 200 results; truncation is explicit.'
  return [
    defineTool({
      name: 'read', description: 'Read a regular UTF-8 text file inside the scanned workspace (max 1 MiB). Absolute internal paths are allowed. Links/junctions are rejected. offset is a 1-based line; limit defaults to 200, maximum 2000.',
      parameters: { file_path: { type: 'string', required: true }, offset: { type: 'integer' }, limit: { type: 'integer' } }, output,
      execute: async ({ file_path, offset = 1, limit = 200 }, exec) => {
        if (!Number.isSafeInteger(offset) || offset < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 2000) throw new Error('Invalid line offset/limit.')
        const lines = (await textFile(file_path, exec.signal)).split('\n')
        return JSON.stringify({ text: lines.slice(offset - 1, offset - 1 + limit).map((line, i) => `${offset + i}: ${line}`).join('\n'), totalLines: lines.length, truncated: offset - 1 + limit < lines.length })
      },
    }),
    defineTool({
      name: 'glob', description: `Find files using a workspace-relative glob pattern (*, **, ?, []); path defaults to the workspace root. ${searchDescription}`,
      parameters: { pattern: { type: 'string', required: true }, path: { type: 'string' } }, output,
      execute: async ({ pattern, path = '.' }, exec) => {
        // Patterns are filters on already checked internal paths, never traversal inputs.
        const found = await files(path, exec.signal)
        const matches = found.paths.map(nameOf).filter(name => matchesGlob(name, pattern))
        return JSON.stringify({ files: matches.slice(0, maxResults), truncated: found.truncated || matches.length > maxResults })
      },
    }),
    defineTool({
      name: 'grep', description: `Search a literal, case-sensitive string (not a regex) in UTF-8 text files up to 1 MiB. path defaults to the workspace root; include is an optional workspace-relative glob filter. ${searchDescription} Unreadable/binary/large files are counted as skipped.`,
      parameters: { pattern: { type: 'string', required: true }, path: { type: 'string' }, include: { type: 'string' } }, output,
      execute: async ({ pattern, path = '.', include = '**/*' }, exec) => {
        if (!pattern) throw new Error('Search text cannot be empty.')
        const found = await files(path, exec.signal)
        const matches: { file: string; line: number; text: string }[] = []
        let skipped = 0
        for (const file of found.paths) {
          if (!matchesGlob(nameOf(file), include)) continue
          let text: string
          try { text = await textFile(file, exec.signal) }
          catch { exec.signal.throwIfAborted(); skipped++; continue }
          for (const [i, line] of text.split('\n').entries()) {
            if (!line.includes(pattern)) continue
            if (matches.length === maxResults) return JSON.stringify({ matches, skipped, truncated: true })
            matches.push({ file: nameOf(file), line: i + 1, text: line.slice(0, 2000) })
          }
        }
        return JSON.stringify({ matches, skipped, truncated: found.truncated })
      },
    }),
  ]
}
