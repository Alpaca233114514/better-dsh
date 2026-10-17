import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const out = new URL('../../.cache/dshgit-preview/', import.meta.url)
await mkdir(out, { recursive: true })
await build({ entryPoints: ['preview/main.tsx'], outfile: fileURLToPath(new URL('app.js', out)), bundle: true, jsx: 'automatic', format: 'esm', loader: { '.css': 'text' } })
await writeFile(new URL('index.html', out), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DSHGit 开发预览</title><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`)
const port = Number(process.env.DSHGIT_PREVIEW_PORT || 4318)
createServer(async (req, res) => {
  const name = req.url?.split('?')[0] === '/app.js' ? 'app.js' : 'index.html'
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8')
  res.end(await readFile(new URL(name, out)))
}).listen(port, '127.0.0.1', () => console.log(`DSHGit 演示数据预览：http://127.0.0.1:${port}`))
