import { build, common } from './build.mjs';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const output = new URL('../../.cache/ultra-tests/', import.meta.url);
await mkdir(output, { recursive: true });
const file = fileURLToPath(new URL('state.test.mjs', output));
await build({ ...common, entryPoints: [fileURLToPath(new URL('../tests/state.test.ts', import.meta.url))], outfile: file, format: 'esm', platform: 'node' });
const hostFile = fileURLToPath(new URL('host.test.mjs', output));
await build({ ...common, external: [], entryPoints: [fileURLToPath(new URL('../tests/host.test.ts', import.meta.url))], outfile: hostFile, format: 'esm', platform: 'node', plugins: [{
  name: 'host-test-boundaries',
  setup(builder) {
    builder.onResolve({ filter: /^@deepseek-ai\/(dsh-typert-protocol|dsh-session)$/ }, args => ({ path: args.path, namespace: 'host-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'host-test' }, args => ({ contents: args.path.endsWith('dsh-session')
      ? 'export function appendPluginRecord() { throw new Error("Unexpected session write"); }'
      : 'export const Remote = () => () => {}; export class TypertRemoteService { constructor(ctx) { this.ctx = ctx; } }' }));
  },
}] });
const child = spawn(process.execPath, ['--test', fileURLToPath(new URL('../tests/policy.test.cjs', import.meta.url)), file, hostFile], { stdio: 'inherit', windowsHide: true });
process.exitCode = await new Promise(resolve => child.once('exit', resolve));
