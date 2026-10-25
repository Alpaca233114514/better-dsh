import { readFile, readdir, mkdir, writeFile, stat, open } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { analyze, csv, markdown } from './analysis.mjs'

export async function inputFiles(input) {
  const s = await stat(input)
  if (s.isFile()) return [input]
  return (await readdir(input)).filter(n => /^run-.*\.jsonl$/.test(n)).sort().map(n => join(input, n))
}
export function parseLines(text, label = 'input') {
  const lines = text.split('\n'), records = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    try { records.push(JSON.parse(lines[i])) }
    catch { throw new Error(`${label}:${i + 1}: invalid JSON; retry after writer flush, or inspect incomplete tail`) }
  }
  return records
}
export async function exportReport(input, out) {
  const records = []
  for (const file of await inputFiles(input)) records.push(...parseLines(await readFile(file, 'utf8'), file))
  const report = analyze(records)
  // A new output directory preserves earlier research exports.
  await mkdir(out)
  await writeFile(join(out, 'requests.csv'), csv(records.filter(r => r.kind === 'call-end')), { flag: 'wx' })
  await writeFile(join(out, 'events.csv'), csv(records.filter(r => !['call-end', 'call-start'].includes(r.kind))), { flag: 'wx' })
  await writeFile(join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(out, 'report.md'), markdown(report), { flag: 'wx' })
  return report
}
function display(r) {
  const n = x => typeof x === 'number' ? x.toFixed(1) : '?'
  const when = new Date(r.endedAt ?? r.time ?? r.startedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' })
  if (r.kind === 'call-end') console.log(`${when} ${r.provider}/${r.model} ${r.purpose} ${r.status} context=${r.contextTokens ?? '?'} output=${r.outputTokens ?? '?'} TPS=${n(r.decodeTps)} TTFT=${n(r.ttftMs)}ms retry=${r.retriesBefore ?? '?'} concurrent=${r.maxConcurrent}`)
  else if (r.kind === 'call-start') console.log(`${when} START ${r.provider}/${r.model} messages=${r.messageCount} messageBytes=${r.messageJsonBytes} tools=${r.toolCount}`)
  else if (r.kind === 'retry') console.log(`${when} RETRY ${r.failureCode} wait=${r.delayMs}ms`)
  else if (r.kind === 'tool-end') console.log(`${when} TOOL ${r.toolName} ${n(r.callToResultMs)}ms error=${r.isError}`)
  else if (r.kind === 'data-loss') console.log(`${when} DATA LOSS ${r.dropped}`)
}
export async function watch(input, signal) {
  const positions = new Map()
  // Starts at the end of existing files. New files are read from byte zero.
  try { for (const file of await inputFiles(input)) {
    const offset = (await stat(file)).size, handle = await open(file, 'r'), last = Buffer.alloc(1)
    try { if (offset) await handle.read(last, 0, 1, offset - 1) } finally { await handle.close() }
    positions.set(file, { offset, tail: '', skipPartial: offset > 0 && last[0] !== 10 })
  } }
  catch (e) { if (e.code !== 'ENOENT') throw e }
  console.log(`观察新动作：${input}（Ctrl+C 停止终端观察；插件继续采集）`)
  while (!signal.aborted) {
    try {
      for (const file of await inputFiles(input)) {
        const p = positions.get(file) ?? { offset: 0, tail: '' }, size = (await stat(file)).size
        if (size < p.offset) { p.offset = 0; p.tail = '' }
        if (size > p.offset) {
          const handle = await open(file, 'r')
          try {
            const buffer = Buffer.alloc(size - p.offset), { bytesRead } = await handle.read(buffer, 0, buffer.length, p.offset)
            p.offset += bytesRead
            // Keep raw bytes until a complete line so split UTF-8 is preserved.
            let content = Buffer.concat([Buffer.from(p.tail, 'base64'), buffer.subarray(0, bytesRead)])
            if (p.skipPartial) {
              const first = content.indexOf(10)
              if (first >= 0) { content = content.subarray(first + 1); p.skipPartial = false }
              else content = Buffer.alloc(0)
            }
            const end = content.lastIndexOf(10)
            if (end >= 0) for (const r of parseLines(content.subarray(0, end + 1).toString('utf8'), file)) display(r)
            p.tail = content.subarray(end + 1).toString('base64')
          } finally { await handle.close() }
        }
        positions.set(file, p)
      }
    } catch (e) { if (e.code !== 'ENOENT') throw e }
    await new Promise(done => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); done() }
      const timer = setTimeout(finish, 1000)
      signal.addEventListener('abort', finish, { once: true })
    })
  }
}
async function main() {
  const args = process.argv.slice(2), mode = args.shift()
  const options = {}
  while (args.length) {
    const key = args.shift()
    if (!['--input', '--out'].includes(key) || !args.length) throw new Error('参数：analyze|watch --input <JSONL 或目录> [--out <新输出目录>]')
    options[key] = args.shift()
  }
  const input = resolve(options['--input'] ?? join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'state', 'dsh-observer'))
  if (mode === 'analyze') {
    if (!options['--out']) throw new Error('请指定 --out <尚不存在的输出目录>')
    const report = await exportReport(input, resolve(options['--out']))
    console.log(`已导出 ${report.totalCalls} 次请求，${report.groups.length} 个分析分组 → ${resolve(options['--out'])}`)
  } else if (mode === 'watch') {
    const controller = new AbortController()
    process.once('SIGINT', () => controller.abort())
    await watch(input, controller.signal)
  } else throw new Error('用法：node DSHObserver/cli.mjs analyze|watch [--input <路径>] [--out <新目录>]')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1 })
