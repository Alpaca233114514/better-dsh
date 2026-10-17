import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { contribution } from './remote.ts'
import { createMeter } from './generated-host.js'

export const inject = ['timer', 'fs', 'sandboxPolicy', 'sessions', 'typert']

export function apply(ctx) {
  const handlers = new Map()
  const storageRoot = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'state', 'token-meter-dashboard')
  const file = join(storageRoot, '.dsh-token-meter.json')
  const originalFS = ctx.get('fs')
  const privateTarget = { privateMeterFile: true }
  // Native plugin data is independent of the Agent workspace. Legacy reads still
  // use DSH's filesystem service; only our single private data file uses Node fs.
  const fs = {
    resolve: (name, options) => options.cwd === storageRoot ? privateTarget : originalFS.resolve(name, options),
    stat: async target => {
      if (target !== privateTarget) return originalFS.stat(target)
      try { return await stat(file) } catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
    },
    readText: target => target === privateTarget ? readFile(file, 'utf8') : originalFS.readText(target),
    writeText: async (target, text) => {
      if (target !== privateTarget) throw new Error('Token Meter writes only its own data file')
      await mkdir(storageRoot, { recursive: true })
      const temporary = file + '.tmp'
      await writeFile(temporary, text, 'utf8')
      await rename(temporary, file)
    },
  }
  const bridge = { storageRoot, handle: (name, fn) => handlers.set(name, fn) }
  const core = createMeter(bridge)
  // Delegate context methods to the real Cordis scope; override only the fs service.
  const scope = new Proxy(ctx, { get(target, key) {
    if (key === 'get') return name => name === 'fs' ? fs : target.get(name)
    const value = Reflect.get(target, key)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  core.apply(scope)
  ctx.typert.remotes.register(contribution)
  class MeterRemote extends TypertRemoteService {
    constructor() { super(ctx, 'tokenMeterDashboard') }
    @Remote
    async state() { return handlers.get('meter:state')() }
    @Remote
    async reset() { return handlers.get('meter:reset')() }
  }
  new MeterRemote()
}
