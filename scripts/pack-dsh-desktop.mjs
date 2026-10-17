// Build/typecheck/test first. Pack existing outputs without lifecycle scripts.
import { mkdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directories = ['DeepSeekSecurity', 'DSHGit', 'DSHKey', 'RichThinking', 'MoonSeek', 'TokenMeter']
const selected = process.argv.slice(2)
if (selected.some(dir => !directories.includes(dir))) throw new Error('Unknown plugin directory')
const destination = resolve(root, '.cache/dsh-0.2.1-rc.1-release')
await mkdir(destination, { recursive: true })
for (const directory of selected.length ? selected : directories) {
  const manifest = JSON.parse(await readFile(resolve(root, directory, 'package.json'), 'utf8'))
  const npm = process.env.npm_execpath
  const command = npm ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  const args = [...(npm ? [npm] : []), 'pack', '--ignore-scripts', '--pack-destination', destination]
  const result = spawnSync(command, args, { cwd: resolve(root, directory), stdio: 'inherit', shell: !npm && process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`Packing ${manifest.name} failed`)
}
