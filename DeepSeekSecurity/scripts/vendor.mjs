import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const checkout = resolve(process.argv[2] ?? '../.cache/codex-security-upstream-20261012')
const source = join(checkout, 'plugins/codex-security')
const target = resolve(process.argv[3] ?? 'vendor/codex-security')
if (existsSync(target)) throw new Error('Vendor destination already exists; use a new directory for review.')
const files = new Set()
function collect(directory, accept = () => true) {
  for (const entry of readdirSync(join(source, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) collect(path, accept)
    else if (accept(path)) files.add(path)
  }
}
collect('scripts', path => /\.(py|json)$/.test(path))
collect('schemas', path => path.endsWith('.json'))
collect('shared', path => path.endsWith('.json'))
collect('references', path => path.endsWith('.md'))
collect('examples/completed-scan')
files.add('.codex-plugin/plugin.json')
function moduleClosure(file) {
  if (files.has(file)) return
  files.add(file)
  const text = readFileSync(join(source, file), 'utf8')
  for (const match of text.matchAll(/(?:from\s+|import\s*\()(["'])(\.[^"']+)\1/g)) {
    const dependency = join(dirname(file), match[2].replace(/\.js$/, '.ts'))
    if (/\.(ts|mts)$/.test(dependency)) moduleClosure(dependency)
    else files.add(dependency)
  }
}
moduleClosure('mcp-app/src/artifact-scan-draft.ts')
moduleClosure('mcp-app/src/artifact-context.ts')
for (const file of files) {
  const destination = join(target, file)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(join(source, file), destination)
}
copyFileSync(join(checkout, 'LICENSE'), join(target, 'LICENSE'))
writeFileSync(join(target, 'FILES.json'), JSON.stringify([...files].map(f => f.replaceAll('\\', '/')).sort(), null, 2) + '\n')
console.log(`Copied ${files.size} unchanged upstream files to ${relative(process.cwd(), target)}`)
