import test from 'node:test'
import assert from 'node:assert/strict'
import { source } from './helpers.mjs'
const { defaults, normalize, languageOf } = await source('config')
const { words, vocabulary, WordBag } = await source('words')

test('default stays Chinese even in an English DSH UI; the two pools never mix', () => {
  assert.equal(languageOf(defaults, 'en-US'), 'zh')
  assert.equal(normalize().language, 'zh')
  assert.ok(words.zh.includes('叽里呱啦中'))
  assert.ok(words.en.length >= 25 && words.zh.length >= 20)
  const zh = vocabulary(normalize({ englishVerbs: ['Only English'], chineseVerbs: ['新想法中'] }), 'zh')
  assert.ok(zh.includes('新想法中'))
  assert.ok(!zh.includes('Only English') && !zh.includes('Pondering'))
  assert.equal(languageOf(normalize({ language: 'en' }), 'zh'), 'en')
})

test('custom append / replace normalizes whitespace, duplicates and ellipses; empty replace falls back', () => {
  const replace = normalize({ vocabularyMode: 'replace', chineseVerbs: ['  叽里呱啦中… ', '', '叽里呱啦中', 7] })
  assert.deepEqual(vocabulary(replace, 'zh'), ['叽里呱啦中'])
  assert.deepEqual(vocabulary(normalize({ vocabularyMode: 'replace' }), 'zh'), [...words.zh])
  assert.ok(vocabulary(normalize({ chineseVerbs: ['新的词中'] }), 'zh').includes('新的词中'))
})

test('shuffle bag never repeats within a cycle or at its boundary', () => {
  const bag = new WordBag(['a', 'b', 'c', 'd'], () => 0.4)
  let last
  for (let cycle = 0; cycle < 20; cycle++) {
    const group = Array.from({ length: 4 }, () => bag.next())
    assert.equal(new Set(group).size, 4)
    assert.notEqual(group[0], last)
    last = group.at(-1)
  }
  assert.equal(new WordBag(['only']).next(), 'only')
})

test('invalid preferences cannot create hot loops and defaults preserve explicit false', () => {
  assert.equal(normalize({ intervalMs: -4 }).intervalMs, 2000)
  assert.equal(normalize({ intervalMs: Infinity }).intervalMs, 5000)
  assert.equal(normalize({ intervalMs: 999999 }).intervalMs, 60000)
  const config = normalize({ enabled: false, animation: false, showElapsed: false })
  assert.equal(config.enabled || config.animation || config.showElapsed, false)
})
