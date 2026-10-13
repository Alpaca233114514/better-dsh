import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Development overlay; managed installations use the package's cordis.patch.yml.
const host = new URL('../dist/host.js', import.meta.url).href
const output = process.argv[2]
if (!output) throw new Error('Usage: node scripts/generate-patch.mjs <new-file> [state-directory]')
const state = process.argv[3] ? resolve(process.argv[3]) : undefined
writeFileSync(resolve(output), `- insert:\n    - id: deepseek-security\n      name: ${JSON.stringify(host)}\n${state ? `      config:\n        stateDirectory: ${JSON.stringify(state)}\n` : ''}`, { flag: 'wx' })
console.log(fileURLToPath(new URL('../dist/host.js', import.meta.url)))
