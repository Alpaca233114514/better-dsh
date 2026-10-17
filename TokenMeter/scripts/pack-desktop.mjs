import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Pin desktop peers so pnpm cannot choose the newer Alpha Cordis in rc.2.
const stage = resolve('../.cache/token-meter-desktop-0.2.0-1/package')
await mkdir(stage, { recursive: true })
for (const name of ['lib', 'cordis.patch.yml', 'README.md', 'DESKTOP.md', 'LICENSE']) {
  await cp(name, resolve(stage, name), { recursive: true })
}
const manifest = JSON.parse(await readFile('package.json', 'utf8'))
manifest.version = '0.2.0-desktop.1'
manifest.peerDependencies['@deepseek-ai/cordis'] = '4.0.4'
manifest.peerDependencies['@deepseek-ai/dsh-typert-protocol'] = '0.2.0-rc.2'
manifest.files = [...new Set([...manifest.files, 'DESKTOP.md'])]
delete manifest.scripts
delete manifest.devDependencies
await writeFile(resolve(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run with npm run pack:desktop')
const result = spawnSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--pack-destination', '..'], { cwd: stage, stdio: 'inherit' })
if (result.status) process.exit(result.status)
