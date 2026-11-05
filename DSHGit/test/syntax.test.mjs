import test from 'node:test'
import assert from 'node:assert/strict'
import { highlightDiff } from '../src/syntax.ts'

test('Python diff preserves text while distinguishing keywords, strings and comments', () => {
  const source = '@@ -1 +1,3 @@\n-return old\n+return "value"\n+# a comment\n+print(42)'
  const tokens = highlightDiff(source, 'tools/build.py')
  assert.equal(tokens.get(2).map(t => t.text).join(''), 'return "value"')
  assert.ok(tokens.get(2).some(t => t.text === 'return' && t.className.includes('keyword')))
  assert.ok(tokens.get(2).some(t => t.text === '"value"' && t.className.includes('string')))
  assert.ok(tokens.get(3).every(t => t.className.includes('comment')))
})

test('multiline tokens span context lines without mixing removed and added code', () => {
  const source = '@@ -1,3 +1,3 @@\n-const text = `old\n+const text = `new\n shared\n tail`;'
  const tokens = highlightDiff(source, 'src/example.ts')
  assert.equal(tokens.get(3).map(t => t.text).join(''), 'shared')
  assert.ok(tokens.get(3).every(t => t.className.includes('string')))
  assert.equal(tokens.get(1).map(t => t.text).join(''), 'const text = `old')
  assert.equal(tokens.get(2).map(t => t.text).join(''), 'const text = `new')
})

test('HTML-looking source stays text tokens, and unknown or oversized diffs stay plain', () => {
  const source = '@@ -0,0 +1 @@\n+<img src=x onerror="alert(1)">'
  const tokens = highlightDiff(source, 'example.html')
  assert.equal(tokens.get(1).map(t => t.text).join(''), '<img src=x onerror="alert(1)">')
  assert.equal(highlightDiff(source, 'example.unknown').size, 0)
  assert.equal(highlightDiff(source + 'x'.repeat(300_000), 'example.html').size, 0)
})
