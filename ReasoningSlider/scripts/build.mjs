import { build } from '../../MoonSeek/node_modules/esbuild/lib/main.js';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
await mkdir(new URL('lib/', root), {recursive:true});
await copyFile(new URL('src/index.js', root), new URL('lib/index.js', root));
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const result = await build({entryPoints:[fileURLToPath(new URL('src/client.jsx', root))],bundle:true,write:false,format:'cjs',platform:'browser',target:'es2022',external:['react','react-dom'],loader:{'.css':'text'}});
await writeFile(new URL('lib/client.js', root), 'window.__ModuleLoader__.load({id:'+JSON.stringify(manifest.name)+',factory(require){const module={exports:{}};const exports=module.exports;\n'+result.outputFiles[0].text+'\nreturn module.exports;}});\n');
