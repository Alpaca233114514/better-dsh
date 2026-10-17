import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'

// DSH and React remain host-owned singletons. Upstream pure artifact helpers
// and JSON schemas are bundled; no Codex executable/SDK is imported.
await build({ entryPoints: ['src/host.ts'], outfile: 'dist/host.js', bundle: true,
  format: 'esm', platform: 'node', target: 'es2022', external: ['@deepseek-ai/*', 'zod', 'zod/*'] })
const client = await build({ entryPoints: ['src/client.tsx'], write: false, bundle: true,
  format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic',
  external: ['@deepseek-ai/*', 'react', 'react/*'], loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
})
// Actual DSH client-module contract: factory registration, not a bare ESM URL.
await writeFile('dist/client.js', `window.__ModuleLoader__.load({ id: "@better-dsh/deepseek-security", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;\n${client.outputFiles[0].text}\nreturn module.exports; } });\n`)
