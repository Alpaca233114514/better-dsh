import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'

await build({
  stdin: { contents: `export * from './src/manager.ts'; export * from './src/workbench.ts'; export * from './src/driver.ts'; export * from './src/remote.ts'; export * from './src/tools.ts'; export * from './src/mention.ts'; export * from './src/progress.ts';`, resolveDir: process.cwd() },
  outfile: 'dist/test-runtime.js', bundle: true, platform: 'node', format: 'esm', target: 'es2022',
  external: ['@deepseek-ai/*', 'zod', 'zod/*'],
})
const result = spawnSync(process.execPath, ['--test', 'test/security.test.mjs'], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
