import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { findingStatusSchema, type FindingStatus } from './contracts.ts'

const entrySchema = z.object({ workspace: z.string(), findingId: z.string(), status: findingStatusSchema, updatedAt: z.string() }).strict()
type Entry = z.infer<typeof entrySchema>

/** 人工处置独立保存，不改扫描证据。 Persist human workflow separately from scan evidence. */
export class FindingState {
  private entries: Entry[] = []
  private writes: Promise<void> = Promise.resolve()
  readonly ready: Promise<void>
  constructor(private directory: string) {
    this.ready = this.restore()
    void this.ready.catch(() => {})
  }
  private async restore() {
    try { this.entries = z.array(entrySchema).parse(JSON.parse(await readFile(join(this.directory, 'finding-statuses.json'), 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  async statuses(workspace: string) {
    await this.ready
    return new Map(this.entries.filter(entry => entry.workspace === workspace).map(entry => [entry.findingId, entry.status]))
  }
  async set(workspace: string, findingId: string, status: FindingStatus) {
    await this.ready
    const write = this.writes.then(async () => {
      const entry = entrySchema.parse({ workspace, findingId, status, updatedAt: new Date().toISOString() })
      const next = [...this.entries.filter(item => item.workspace !== workspace || item.findingId !== findingId), entry]
      await mkdir(this.directory, { recursive: true })
      const temporary = join(this.directory, `finding-statuses-${randomUUID()}.tmp`)
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' })
      await rename(temporary, join(this.directory, 'finding-statuses.json'))
      this.entries = next
    })
    this.writes = write.catch(() => {})
    await write
  }
}
