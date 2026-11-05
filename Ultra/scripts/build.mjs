import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const require = createRequire(new URL('../package.json', import.meta.url));
let build;
try { ({ build } = require('esbuild')); } catch { ({ build } = await import('../../MoonSeek/node_modules/esbuild/lib/main.js')); }
export { build };
export const nodePaths = [fileURLToPath(new URL('../node_modules', import.meta.url)), fileURLToPath(new URL('../../DeepSeekSecurity/node_modules', import.meta.url))];
export const common = { bundle: true, target: 'es2022', nodePaths, external: ['@deepseek-ai/*'], logLevel: 'warning' };
await mkdir(new URL('lib', root), { recursive: true });
await build({ ...common, entryPoints: [fileURLToPath(new URL('src/host.ts', root))], outfile: fileURLToPath(new URL('lib/host.js', root)), format: 'esm', platform: 'node' });
const client = await build({ ...common, entryPoints: [fileURLToPath(new URL('src/client.tsx', root))], write: false, format: 'cjs', platform: 'browser', external: [...common.external, 'react', 'react/*'], loader: { '.css': 'text' } });
await writeFile(new URL('lib/client.js', root), `window.__ModuleLoader__.load({id:"dsh-ultra",factory(require){const module={exports:{}};const exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`);
let zodManifest;
try { zodManifest = require.resolve('zod/package.json'); }
catch { zodManifest = fileURLToPath(new URL('../../DeepSeekSecurity/node_modules/zod/package.json', import.meta.url)); }
const zodLicense = await readFile(new URL('./LICENSE', (await import('node:url')).pathToFileURL(zodManifest)), 'utf8');
await writeFile(new URL('THIRD-PARTY-NOTICES.md', root), '# Third-party notices\n\nZod 4.6.6 is bundled for schema validation. Source: https://github.com/colinhacks/zod\n\n' + zodLicense);
