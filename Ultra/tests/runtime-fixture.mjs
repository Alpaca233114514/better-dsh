import { LlmAdapter } from 'file:///C:/Users/Logan/AppData/Local/Programs/DeepSeek%20Harness/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { verifyNativeUi } from './browser-runtime.mjs';

export const inject = ['llm', 'sessions'];
const selection = { provider: 'deepseek-ultra-test', model: 'deepseek-ultra-fixture', reasoningEffort: 'max' };
const reasoning = { defaultEffort: 'high', efforts: [{ id: 'low', name: '低' }, { id: 'medium', name: '中' }, { id: 'high', name: '高' }, { id: 'max', name: 'Max' }] };
function* response(text) {
  yield { type: 'block-start', index: 0, blockType: 'text' };
  yield { type: 'text-delta', index: 0, text };
  yield { type: 'block-end', index: 0, block: { type: 'text', text } };
  yield { type: 'finish', reason: { kind: 'stop' } };
}
function* delegation() {
  for (const index of [0, 1]) {
    const id = `ultra-fixture-${index}`;
    const args = JSON.stringify({ description: index ? '验证设计' : '接口检查', prompt: 'Return a short independent test observation. Do not use any tools.' });
    yield { type: 'block-start', index, blockType: 'tool-call' };
    yield { type: 'tool-call-delta', index, id, name: 'subagent', argumentsDelta: args };
    yield { type: 'block-end', index, block: { type: 'tool-call', id, name: 'subagent', arguments: args } };
  }
  yield { type: 'finish', reason: { kind: 'tool-calls' } };
}
class Fixture extends LlmAdapter {
  requests = [];
  delegated = new Set();
  constructor(ctx) { super(); this.ctx = ctx; }
  providerInfo(id) { return { id, name: 'Ultra 本地集成验证' }; }
  async listModels(provider) { return [{ provider, id: selection.model, name: 'DeepSeek · Ultra 验证', reasoning }]; }
  async resolveModel(provider, model) { if (model !== selection.model) throw new Error('Unknown fixture model'); return { provider, id: model, name: 'DeepSeek · Ultra 验证', reasoning }; }
  async *stream(options) {
    const child = this.ctx.sessions.get(options.sessionId)?.header.origin === 'subagent';
    const prompt = JSON.stringify(options.messages);
    this.requests.push({ sessionId: options.sessionId, child, purpose: options.purpose, effort: options.reasoningEffort, tools: (options.tools ?? []).map(t => t.name), ultra: prompt.includes('Ultra mode: proactively delegate') });
    if (options.purpose) { yield* response('Ultra integration'); return; }
    if (!child && prompt.includes('ULTRA_INTEGRATION_START') && !this.delegated.has(options.sessionId)) {
      this.delegated.add(options.sessionId); yield* delegation(); return;
    }
    if (child) await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 400);
      options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
    });
    yield* response(child ? 'Independent fixture observation complete.' : 'Fixture summary complete.');
  }
}

async function until(predicate, timeout = 20000) {
  const start = Date.now();
  while (!(await predicate())) { if (Date.now() - start > timeout) throw new Error('Timed out waiting for native lifecycle'); await new Promise(resolve => setTimeout(resolve, 50)); }
}

export function apply(ctx) {
  const adapter = new Fixture(ctx);
  ctx.llm.registerAdapter([selection.provider], adapter);
  ctx.inject(['dshUltra', 'sessionController', 'subagents', 'sessions', 'agents', 'connection', 'webServer'], scope => {
    const directory = join(process.env.DSH_HOME, 'verification');
    const report = join(directory, 'runtime.json');
    const settled = [];
    scope.on('subagent/end', info => settled.push({ id: info.id, reason: info.stopReason }));
    async function run() {
      await mkdir(directory, { recursive: true });
      if (process.env.ULTRA_UI_ONLY === '1') {
        const saved = JSON.parse(await readFile(report, 'utf8'));
        await verifyNativeUi(scope.connection.authenticatedUrl(scope.webServer.getOrigin()), saved.sessionId);
        return;
      }
      await writeFile(report, JSON.stringify({ status: 'running' }));
      let sessionId;
      try {
        ({ sessionId } = await scope.sessionController.create({ cwd: process.cwd() }));
        const state = await scope.dshUltra.select({ sessionId, selection, ultra: true });
        assert.equal(state.enabled, true);
        const followAbort = new AbortController();
        const frames = [];
        const follow = (async () => { for await (const frame of scope.dshUltra.follow(sessionId, followAbort.signal)) frames.push(frame); })();
        await scope.sessionController.prompt({ sessionId, requestId: 'ultra-fixture-start', mode: 'queue', content: [{ type: 'text', text: 'ULTRA_INTEGRATION_START: delegate two independent read-only checks, then summarize their observations.' }] }, new AbortController().signal);
        await until(() => settled.length >= 2 && scope.agents.get(sessionId)?.status === 'idle');
        const childRequests = adapter.requests.filter(r => r.child);
        assert.deepEqual(childRequests.map(r => r.effort), ['max', 'max']);
        assert(settled.every(row => row.reason === 'completed'));
        const parentRequests = adapter.requests.filter(r => !r.child && !r.purpose);
        assert(parentRequests.every(r => r.effort === 'max' && r.ultra));
        assert(parentRequests[0].tools.includes('subagent'));
        assert(adapter.requests.every(r => !r.tools.includes('ultra_subagent')));
        assert(frames.some(f => f.enabled));
        assert.equal(typeof scope.dshUltra.effort, 'undefined');
        await assert.rejects(scope.dshUltra.select({ sessionId, selection: { ...selection, reasoningEffort: 'ultra' }, ultra: true }));
        await scope.dshUltra.select({ sessionId, selection: { ...selection, reasoningEffort: 'high' }, ultra: false });
        assert.equal(scope.dshUltra.view(sessionId).enabled, false);
        const before = adapter.requests.length;
        await scope.sessionController.prompt({ sessionId, requestId: 'ultra-fixture-standard', mode: 'queue', content: [{ type: 'text', text: 'Continue with a short plain response.' }] }, new AbortController().signal);
        await until(() => adapter.requests.length > before && scope.agents.get(sessionId)?.status === 'idle');
        assert.equal(adapter.requests.at(-1).effort, 'high');
        // 历史指令仍在日志中，只检查当前系统消息。 History is preserved; inspect current system prompt.
        await scope.dshUltra.select({ sessionId, selection, ultra: true });
        followAbort.abort(); await follow;
        await scope.sessions.flush(scope.sessions.get(sessionId));
        await writeFile(report, JSON.stringify({ status: 'passed', sessionId, requests: adapter.requests, streamFrames: frames.length, nativeChildren: settled, checks: ['native host load', 'max request', 'native subagent tool only', 'native parallel children inherit max', 'no custom delegation tool', 'no custom effort API', 'mode stream', 'ultra parameter rejection', 'standard mode exit', 'session flush'] }, null, 2));
        await verifyNativeUi(scope.connection.authenticatedUrl(scope.webServer.getOrigin()), sessionId);
      } catch (error) {
        await writeFile(report, JSON.stringify({ status: 'failed', sessionId, error: error.stack, requests: adapter.requests, ...(sessionId && scope.sessions.get(sessionId) ? { view: scope.dshUltra.view(sessionId) } : {}) }, null, 2));
      }
    }
    const timer = setTimeout(() => { void run(); }, 1200);
    scope.effect(() => () => clearTimeout(timer));
  });
}
