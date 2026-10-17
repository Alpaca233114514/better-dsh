import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const out = new URL('../../.cache/dshkey-preview/', import.meta.url)
await mkdir(out, { recursive: true })
await build({ absWorkingDir: root, entryPoints: ['preview/main.tsx'], outfile: fileURLToPath(new URL('app.js', out)), bundle: true, format: 'esm', target: 'es2022' })
await writeFile(new URL('index.html', out), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSHKey 开发预览</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
const port = Number(process.env.DSHKEY_PREVIEW_PORT || 4322)
createServer(async (req, res) => {
  const name = req.url === '/app.js' ? 'app.js' : 'index.html'
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8')
  res.end(await readFile(new URL(name, out)))
}).listen(port, '127.0.0.1', () => console.log(`DSHKey 演示数据预览：http://127.0.0.1:${port}`))
