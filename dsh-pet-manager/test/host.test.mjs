import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import * as plugin from '../lib/host.js';
test('real Cordis plugin registers Remote metadata, settings ownership and strict request validation', async () => {
  const ctx = new Context(), contributions = []; let configured = 0;
  ctx.provide('typert', { remotes: { register: value => contributions.push(value) }, local: { get: () => undefined, hasSeen: () => false }, lookups: { definitions: () => [] } });
  ctx.provide('settings', { configure: () => { configured++; return () => {}; } });
  const fiber = ctx.plugin(plugin); await fiber.await();
  try {
    const service = ctx.get('petManager');
    assert.ok(service); assert.deepEqual(remoteMethods(service).map(m => m.method), ['run']);
    assert.equal(contributions[0].descriptors[0].namespace, 'petManager'); assert.equal(configured, 1);
    const result = await service.run({ owner: 'test', action: 'poll' }); assert.equal(result.available, false);
    await assert.rejects(service.run({ owner: '', action: 'poll' }));
    await assert.rejects(service.run({ owner: 'test', action: 'execute', command: 'anything' }));
    await service.run({ owner: 'test', action: 'hide' });
  } finally { await fiber.dispose(); }
});
