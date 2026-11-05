const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/policy.cjs');
const effects = require('../../ReasoningSlider/src/effect-policy.cjs');

test('Ultra uses max in the request and opts into proactive delegation', () => {
  assert.deepEqual(policy.selection('ultra'), { mode: 'ultra', reasoningEffort: 'max', proactiveDelegation: true });
  assert.deepEqual(policy.childOptions(), { reasoningEffort: 'max' });
  assert.equal(policy.childOptions('high').reasoningEffort, 'high');
  assert.throws(() => policy.childOptions('ultra'));
});
test('Disabling Ultra falls back to max and removes proactive instructions', () => {
  assert.deepEqual(policy.selection('ultra', false), policy.selection('max'));
  assert.equal(policy.delegationInstructions('ultra', false), '');
  assert.match(policy.delegationInstructions('ultra'), /proactively delegate/);
});
test('Effects belong exclusively to Ultra when available, otherwise Max', () => {
  const full = ['low', 'high', 'max', 'ultra'];
  assert.equal(effects.isEmphasized('max', full), false);
  assert.equal(effects.isEmphasized('ultra', full), true);
  assert.equal(effects.isEmphasized({ id: 'max' }, [{ id: 'high' }, { id: 'max' }]), true);
  assert.equal(effects.isEmphasized('high', ['low', 'high']), false);
  assert.equal(effects.isEmphasized(undefined, []), false);
});
