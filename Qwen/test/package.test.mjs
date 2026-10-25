import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const patch = read('cordis.patch.yml')

test('package exposes the DSH bundle patch', () => {
  assert.equal(pkg.name, 'dsh-qwen')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['.'], './lib/index.js')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
})

test('bundle patch inserts exactly this plugin', () => {
  assert.match(patch, /- insert:/u)
  assert.match(patch, /id: qwen/u)
  assert.match(patch, new RegExp(`name: ${pkg.name}`, 'u'))
  assert.match(patch, /apiKeyEnv: QWEN_API_KEY/u)
  assert.match(patch, /thinkingBudgets:/u)
})

test('host packages stay external to the bundle', async () => {
  const source = read('lib/index.js')
  assert.match(source, /from ['"]@deepseek-ai\/dsh-llm-pi-ai['"]/u)
  assert.match(read('lib/config.js'), /from ['"]@deepseek-ai\/schemastery['"]/u)
  assert.match(source, /@earendil-works\/pi-ai\/api\/openai-completions/u)
})

test('the built plugin exports the Cordis function-plugin surface', async () => {
  // Importing the built module needs the host runtime, so assert on the bundle
  // surface instead: the loader requires `apply` and reads `Config`/`name`.
  const source = read('lib/index.js')
  assert.match(source, /export (?:function )?apply|export \{[\s\S]*\bapply\b/u)
  assert.match(source, /\bConfig\b/u)
  assert.match(source, /dsh-qwen/u)
})
