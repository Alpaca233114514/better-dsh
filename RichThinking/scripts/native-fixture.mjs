import { build } from 'esbuild'
import { access, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'

export const pluginRoot = fileURLToPath(new URL('../', import.meta.url))
export const upstream = resolve(process.env.DSH_SOURCE || join(pluginRoot, '../.cache/dsh-upstream-20261012'))
export async function available() {
  try { await access(join(upstream, 'packages/client/ui-chat/src/client/chat/ReasoningRow.tsx')); return true }
  catch { return false }
}

/** Read the actual upstream files; never modify, vendor, or mock their implementations. */
export async function nativeFixture(browser = false) {
  const out = join(pluginRoot, '.cache', browser ? 'browser' : 'native')
  await mkdir(out, { recursive: true })
  const native = path => JSON.stringify(join(upstream, path).replaceAll('\\', '/'))
  const rowSource = await readFile(join(upstream, 'packages/client/ui-chat/src/client/chat/ReasoningRow.tsx'), 'utf8')
  const hasBodySlot = rowSource.includes("renderSlot('conversation.chat.reasoning.body'")
  const entry = `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ReasoningRow } from ${native('packages/client/ui-chat/src/client/chat/ReasoningRow.tsx')};
    export { assistantDefinition } from ${native('packages/client/ui-chat/src/client/conversation-nodes/assistant.ts')};
    import { apply } from ${JSON.stringify(join(pluginRoot, 'src/client.tsx').replaceAll('\\', '/'))};
    export { ReasoningRow, React, createRoot, apply };
    export { Settings } from ${JSON.stringify(join(pluginRoot, 'src/settings.tsx').replaceAll('\\', '/'))};
    export const bodySelector = ${JSON.stringify(hasBodySlot ? '[data-slot="conversation.chat.reasoning.body"]' : '[data-native-markdown-fixture]')};
    export function NativeRow({ text = '**Actual model text**\\n\\nMore reasoning.', running = true, body = null }) {
      return React.createElement('div', { 'data-chat-flow-kind': 'assistant-step' },
        React.createElement(ReasoningRow, {
          text, running,
          useDisclosure() { const [expanded, setExpanded] = useState(false); return { expanded, setExpanded, toggle: () => setExpanded(v => !v) }; },
          usePresentation: select => select({ settledReasoningPreview: true }),
          t: key => ({ 'message.think': '思考', 'row.running': '运行中' })[key] || key,
          renderSlot: (name, props) => React.createElement('div', { 'data-slot': name }, body || React.createElement('pre', null, props.text)),
        }));
    }
    ${browser ? await readFile(new URL('../test/browser-entry.txt', import.meta.url), 'utf8') : ''}
  `
  await build({ stdin: { contents: entry, resolveDir: pluginRoot, loader: 'tsx' },
    outfile: join(out, 'fixture.js'), bundle: true, format: browser ? 'iife' : 'esm',
    platform: browser ? 'browser' : 'node', target: 'es2022', jsx: 'automatic',
    external: browser ? [] : ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    nodePaths: [join(pluginRoot, 'node_modules')],
    plugins: [{ name: 'native-primitives-subset', setup(build) {
      build.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'native' }))
      build.onLoad({ filter: /.*/, namespace: 'native' }, () => ({
        contents: `import React from 'react';
          // rc.2 renders MarkdownText directly; this is the body test double,
          // equivalent to the alpha.2 test Slot. The disclosure itself stays native.
          export const MarkdownText = ({text}) => React.createElement('pre', {'data-native-markdown-fixture':''}, text);
          export { DisclosureRow } from ${native('packages/client/ui-primitives/src/DisclosureRow.tsx')};
          export { Button } from ${native('packages/client/ui-primitives/src/Button.tsx')};
          export { Input } from ${native('packages/client/ui-primitives/src/Input.tsx')};
          export { Switch } from ${native('packages/client/ui-primitives/src/Switch.tsx')};
          export { TextShimmer } from ${native('packages/client/ui-primitives/src/TextShimmer.tsx')};
          export { IconThinkOutlineRegular } from ${native('packages/client/ui-primitives/src/icons/index.tsx')};`,
        loader: 'tsx', resolveDir: pluginRoot,
      }))
    } }],
  })
  return out
}
