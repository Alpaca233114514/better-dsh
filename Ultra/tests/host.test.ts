import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UltraService } from '../src/host';

test('Host follows per-step Team availability and removes delegation when Ultra is off', async () => {
  let section: any;
  let request: any;
  let enabled = true;
  const agent = { session: { header: {} } };
  const admitted = { team: true };
  const ctx = {
    sessionProjections: { register() {}, onChanged() {}, stateOf: () => ({ enabled }) },
    on(name: string, fn: any) { if (name === 'agent/request') request = fn; },
    effect() {},
    systemPrompt: { section(value: any) { section = value; } },
    subagents: { getProvider: () => ({ prepareContinuable() {}, capabilities: { agentOptions: true, depthLimit: true } }) },
    tools: { get(name: string, scope: any, toolSet: any) {
      assert.equal(name, 'spawn_teammate');
      assert.equal(scope, agent);
      assert.equal(toolSet, admitted);
      return toolSet.team ? { name } : undefined;
    } },
  };
  new UltraService(ctx);
  assert.match(section.text({ agent, toolSet: admitted }), /MUST call spawn_teammate/);
  const modelRequest = { reasoningEffort: 'high', tools: ['host tools'] };
  assert.deepEqual(await request({ agent }, async () => modelRequest), { ...modelRequest, reasoningEffort: 'max' });
  admitted.team = false;
  const ordinary = section.text({ agent, toolSet: admitted });
  assert.match(ordinary, /MUST start at least one native subagent/);
  assert.doesNotMatch(ordinary, /spawn_teammate|team_task_create/);
  admitted.team = true;
  assert.match(section.text({ agent, toolSet: admitted }), /MUST call spawn_teammate/);
  enabled = false;
  assert.equal(section.text({ agent, toolSet: admitted }), '');
  assert.equal(await request({ agent }, async () => modelRequest), modelRequest);
  assert.equal(section.text({}), '');
});
