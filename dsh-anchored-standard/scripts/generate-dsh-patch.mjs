#!/usr/bin/env node
// Local adapter for DSH 0.2 declarative presets. No dependency installation or
// profile mutation: generate an overlay that the user can pass to --patch.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
export const modes = {
  'anchored-standard': 'preset',
  'zero-anchored-standard': 'zero-anchored-standard',
  'whoami-standard': 'whoami-standard',
}

export function generatePatch(mode = 'anchored-standard', presetRoot = root) {
  const dir = modes[mode]
  if (!dir) throw new Error('Unknown mode: ' + mode)
  const directory = join(presetRoot, dir)
  const metadata = readFileSync(join(directory, 'preset.yml'), 'utf8')
  const name = /^name:\s*(.+)$/m.exec(metadata)?.[1]
  const description = /^description:\s*(.+)$/m.exec(metadata)?.[1]
  if (!name || !description) throw new Error('Missing preset display fields')
  const plugins = readFileSync(join(directory, 'agent.cordis.yml'), 'utf8')
    .replace(/^(\s*name:\s*)\.\/(\S+\.mjs)\s*$/gm, (_match, prefix, file) => {
      const target = join(directory, file)
      if (!existsSync(target)) throw new Error('Missing local plugin: ' + target)
      return prefix + JSON.stringify(pathToFileURL(target).href)
    })
  // Local module URLs are absolute: moving the checkout requires regenerating
  // the patch; Node resolves transitive imports beside each mode's own files.
  return `# Generated for DSH 0.2.1-alpha.2. Regenerate after moving the checkout.
- insert:
    - id: preset-${mode}
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: ${mode}
        name: ${JSON.stringify(name)}
        description: ${JSON.stringify(description)}
        order: 5
        plugins:
${plugins.split(/\r?\n/).map((line) => '          ' + line).join('\n')}
`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let mode = 'anchored-standard'
  let output
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) mode = args[++i]
    else if (args[i] === '--out' && args[i + 1]) output = args[++i]
    else throw new Error('Usage: node scripts/generate-dsh-patch.mjs [--mode <id>] [--out <new-file>]')
  }
  const patch = generatePatch(mode)
  if (output) writeFileSync(resolve(output), patch, { flag: 'wx' })
  else process.stdout.write(patch)
}
