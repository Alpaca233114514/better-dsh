import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
await mkdir('.test-build', { recursive: true })
await build({ entryPoints: ['src/description.ts'], outfile: '.test-build/description.mjs', bundle: true, platform: 'node', format: 'esm', external: ['@deepseek-ai/*', 'zod'] })
const { descriptionGenerator } = await import('../.test-build/description.mjs')
const input = { kind: 'commit', branch: 'codex/test', diff: '+change', summary: 'one file' }
function fixture(chunks, next = { provider: 'selected', model: 'current' }) {
  const calls = [], controller = new AbortController()
  const ctx = {
    sessionProjections: { snapshot: () => ({ values: { modelSelection: { next } } }) },
    llm: { async *stream(options) { calls.push(options); for (const chunk of chunks) yield chunk } },
  }
  const session = { requestHeader: () => ({ config: { provider: 'logged', model: 'previous' } }) }
  return { calls, controller, generate: descriptionGenerator(ctx, session, controller.signal) }
}
const text = value => [{ type: 'text-delta', index: 0, text: JSON.stringify(value) }, { type: 'finish', reason: { kind: 'stop' } }]
test('generation uses current session selection, bounded diff, and no executable tools', async () => {
  const f = fixture(text({ message: '修复导航布局' }))
  assert.deepEqual(await f.generate({ ...input, diff: 'x'.repeat(60000) }), { message: '修复导航布局' })
  assert.equal(f.calls[0].provider, 'selected'); assert.equal(f.calls[0].model, 'current')
  assert.equal(f.calls[0].tools, undefined)
  assert.match(f.calls[0].messages[0].content[0].text, /内容已截断/)
  assert.ok(f.calls[0].messages[0].content[0].text.length < 50000)
})
test('PR generation only requires missing fields and falls back to logged session route', async () => {
  const f = fixture(text({ body: '修改布局。\n未提供测试结果。' }), null)
  assert.match((await f.generate({ ...input, kind: 'pr', title: '手工标题' })).body, /布局/)
  assert.equal(f.calls[0].provider, 'logged')
})
test('incomplete, malformed and missing-field output is rejected', async () => {
  for (const chunks of [text({}), text({ message: '' }), [{ type: 'text-delta', index: 0, text: '{"message":"partial"}' }], [{ type: 'text-delta', index: 0, text: 'not JSON' }, { type: 'finish', reason: { kind: 'stop' } }], [{ type: 'finish', reason: { kind: 'max-tokens' } }]]) {
    await assert.rejects(fixture(chunks).generate(input), /模型生成说明失败/)
  }
})
test('plugin cancellation prevents returning generated text for a pending write', async () => {
  const f = fixture(text({ message: '不得提交' })); f.controller.abort()
  await assert.rejects(f.generate(input), /操作未继续/)
})
