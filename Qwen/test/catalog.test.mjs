import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_THINKING_BUDGETS,
  resolveModels,
  validateThinkingBudgets,
} from '../lib/catalog.js'

const BASE = 'https://example.test/compatible-mode/v1'

function build(overrides = {}) {
  return resolveModels({
    route: 'qwen-flash',
    baseURL: BASE,
    models: [{ id: 'qwen3.8-flash' }],
    thinkingBudgets: { ...DEFAULT_THINKING_BUDGETS },
    ...overrides,
  })
}

test('qwen3.8-flash inherits the verified preset', () => {
  const [model] = build()
  assert.equal(model.id, 'qwen3.8-flash')
  assert.equal(model.name, 'Qwen3.8 Flash')
  assert.equal(model.provider, 'qwen-flash')
  assert.equal(model.baseUrl, BASE)
  assert.equal(model.contextWindow, 1_000_000)
  assert.equal(model.maxTokens, 131_072)
  assert.deepEqual(model.input, ['text', 'image'])
  assert.equal(model.reasoning, true)
})

test('thinking compat never sends reasoning_effort and always names thinking_budget', () => {
  const [model] = build()
  assert.equal(model.compat.thinkingFormat, 'qwen')
  assert.equal(model.compat.supportsReasoningEffort, false)
  assert.equal(model.compat.thinkingTokenBudgetField, 'thinking_budget')
  assert.equal(model.compat.supportsDeveloperRole, false)
  assert.equal(model.compat.supportsStore, false)
})

test('only budget-backed levels are selectable', () => {
  const [model] = build()
  const levels = model.thinkingLevelMap
  for (const level of ['minimal', 'low', 'medium', 'high']) {
    assert.equal(levels[level], level)
  }
  // `off` travels as the absence of the key; xhigh/max have no budget slot.
  assert.equal(Object.hasOwn(levels, 'off'), false)
  assert.equal(Object.hasOwn(levels, 'xhigh'), false)
  assert.equal(Object.hasOwn(levels, 'max'), false)
})

test('an explicit entry overrides preset metadata', () => {
  const [model] = build({
    models: [{ id: 'qwen3.8-flash', name: 'Flash', contextWindow: 128_000, maxTokens: 8_192, input: ['text'] }],
  })
  assert.equal(model.name, 'Flash')
  assert.equal(model.contextWindow, 128_000)
  assert.equal(model.maxTokens, 8_192)
  assert.deepEqual(model.input, ['text'])
})

test('thinking false declares a non-thinking model without qwen switches', () => {
  const [model] = build({ models: [{ id: 'qwen3.8-flash', thinking: false }] })
  assert.equal(model.reasoning, false)
  assert.equal(model.thinkingLevelMap, undefined)
  assert.equal(model.compat.thinkingFormat, undefined)
  assert.equal(model.compat.thinkingTokenBudgetField, undefined)
  assert.equal(model.compat.supportsDeveloperRole, false)
})

test('unknown models take neutral fallbacks', () => {
  const [model] = build({ models: [{ id: 'some-new-qwen' }] })
  assert.equal(model.name, 'some-new-qwen')
  assert.equal(model.contextWindow, 262_144)
  assert.equal(model.maxTokens, 32_768)
  assert.deepEqual(model.input, ['text'])
})

test('budgets must be positive integers that escalate', () => {
  assert.throws(() => validateThinkingBudgets({ minimal: 1024, low: 1024, medium: 4096, high: 8192 }), /must increase/u)
  assert.throws(() => validateThinkingBudgets({ minimal: 0, low: 4096, medium: 8192, high: 16384 }), /positive integer/u)
  assert.throws(() => validateThinkingBudgets({ minimal: 1024, low: 4096, medium: 8192, high: 1.5 }), /positive integer/u)
})

test('catalog rejects duplicate and empty model ids', () => {
  assert.throws(() => build({ models: [{ id: 'a' }, { id: 'a' }] }), /listed twice/u)
  assert.throws(() => build({ models: [{ id: '   ' }] }), /non-empty id/u)
  assert.throws(() => build({ models: [] }), /at least one model/u)
})

test('schema-normalized empty modalities inherit preset and gateway aliases keep wire id', () => {
  const [model] = build({ models: [{ id: 'cmaas-qwen3.8-flash', input: [] }] })
  assert.deepEqual(model.input, ['text', 'image'])
  assert.equal(model.id, 'cmaas-qwen3.8-flash')
  assert.equal(model.contextWindow, 1000000)
})
test('effort and budget modes can coexist by model without sharing mutable metadata', () => {
  const [a, b] = build({ thinkingMode: 'effort', models: [{ id: 'a' }, { id: 'b', thinkingMode: 'budget' }] })
  assert.equal(a.compat.supportsReasoningEffort, true)
  assert.equal(a.compat.thinkingTokenBudgetField, undefined)
  assert.equal(b.compat.supportsReasoningEffort, false)
  assert.equal(b.compat.thinkingTokenBudgetField, 'thinking_budget')
  a.input.push('image')
  assert.deepEqual(b.input, ['text'])
})
test('explicit aliases and invalid capacities fail before route registration', () => {
  assert.equal(build({ models: [{ id: 'deployment-1', preset: 'qwen3.8-flash' }] })[0].contextWindow, 1000000)
  assert.throws(() => build({ models: [{ id: 'a', preset: 'missing' }] }), /unknown preset/)
  assert.throws(() => build({ models: [{ id: 'a', maxTokens: 0 }] }), /positive integer/)
})
