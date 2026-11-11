import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('../.cache/pet-manager-preview', { recursive: true });
await build({ entryPoints: ['preview/main.jsx'], outfile: '../.cache/pet-manager-preview/app.js', bundle: true, format: 'esm', target: 'es2022', jsx: 'transform', loader: { '.css': 'text' } });
await writeFile('../.cache/pet-manager-preview/index.html', '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DSH Pet Manager 组件预览</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
createServer(async (req, res) => { const name = req.url === '/app.js' ? 'app.js' : 'index.html'; res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html;charset=utf-8'); res.end(await readFile(`../.cache/pet-manager-preview/${name}`)); }).listen(4326, '127.0.0.1', () => console.log('Pet manager preview: http://127.0.0.1:4326'));
