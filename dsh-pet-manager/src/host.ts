import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { contribution, requestSchema } from './remote.ts'

export const inject = ['typert']
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(), animated: z.boolean().default(true).volatile(),
  size: z.number().min(72).max(180).default(112).volatile(), selected: z.string().default('alpaca').volatile(),
  library: z.string().default('[]').volatile(), desktop: z.boolean().default(false).volatile(),
})
class PetService extends TypertRemoteService {
  child: ReturnType<typeof spawn> | undefined
  owner = ''; lastSeen = 0; actions: string[] = []; message = ''
  constructor(ctx: any) {
    super(ctx, 'petManager')
    ctx.effect(() => {
      const timer = setInterval(() => { if (Date.now() - this.lastSeen > 10000) this.stop() }, 5000)
      timer.unref()
      return () => { clearInterval(timer); this.stop() }
    })
  }
  stop() { this.child?.kill(); this.child = undefined; this.owner = ''; this.actions = [] }
  @Remote
  async run(raw: unknown) {
    const req = requestSchema.parse(raw)
    if (this.owner && this.owner !== req.owner && Date.now() - this.lastSeen < 10000) return { available: false, message: '桌面伙伴由另一个 DSH 窗口连接', actions: [] }
    this.owner = req.owner; this.lastSeen = Date.now()
    if (req.action === 'hide') { this.stop(); return { available: true, message: '', actions: [] } }
    if (req.action === 'sync' && req.state) {
      if (!this.child) {
        try {
          const packageFile = createRequire(import.meta.url).resolve('electron/package.json')
          const directory = dirname(packageFile)
          const executable = join(directory, 'dist', readFileSync(join(directory, 'path.txt'), 'utf8').trim())
          if (!existsSync(executable)) throw new Error('Electron binary missing')
          const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
          this.child = spawn(executable, [fileURLToPath(new URL('../native/main.cjs', import.meta.url))], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
          const child = this.child
          child.on('message', (m: any) => { if (['chat', 'voice', 'notifications'].includes(m?.action)) this.actions = [...this.actions.slice(-15), m.action] })
          child.on('error', error => { this.message = error.message; if (this.child === child) this.child = undefined })
          child.on('exit', () => { if (this.child === child) { this.child = undefined; this.message = '桌面窗口已关闭' } })
          child.once('message', () => { if (child.connected) child.send(req.state) })
        } catch { this.message = '未找到 Electron 桌面运行时，请安装可选依赖后重启 DSH' }
      } else if (this.child.connected) this.child.send(req.state)
    }
    const actions = this.actions.splice(0)
    return { available: Boolean(this.child), message: this.child ? '' : this.message, actions }
  }
}
export function apply(ctx: any, config: any = {}) {
  ctx.inject(['settings'], (scope: any) => {
    if (typeof scope.settings.configure === 'function') scope.effect(() => scope.settings.configure({ auto: true }, ctx.fiber))
    else scope.settings.register('dsh-pet-manager', Config, { base: config })
  })
  ctx.typert.remotes.register(contribution)
  new PetService(ctx)
}
