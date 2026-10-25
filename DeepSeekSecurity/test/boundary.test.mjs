import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { createScope, bindScopeParent, scopeOf } from '@deepseek-ai/dsh-scope'
import { DshScanDriver } from '../dist/test-runtime.js'

// Real driver, AgentRegistry, ToolRuntime and AgentLoop; synthetic files only.
// The provider is scripted and never connects to a model or network service.
for (const preset of ['minimal-windows', 'standard']) {
  test(`workspace boundary reaches the real model-input path with ${preset} parent`, async () => {
    // Windows TEMP may use an 8.3 alias; keep valid absolute probes canonical.
    // Windows 临时目录可能使用短路径，合法绝对路径探针须使用规范路径。
    const root = await realpath(await mkdtemp(join(tmpdir(), 'security-boundary-')))
    const workspace = join(root, 'workspace'), outside = join(root, 'workspace-neighbor')
    await mkdir(workspace); await mkdir(outside)
    await mkdir(join(workspace, 'nested'))
    const secret = 'SYNTHETIC_EXTERNAL_CONTENT_MUST_NOT_REACH_PROVIDER_8917'
    const internal = 'SYNTHETIC_INTERNAL_CONTENT_2468'
    await writeFile(join(outside, 'canary.txt'), `needle ${secret}`)
    await writeFile(join(workspace, 'nested', 'safe.txt'), `needle ${internal}\nsecond line`)
    await symlink(outside, join(workspace, 'escape-junction'), process.platform === 'win32' ? 'junction' : 'dir')
    await symlink(join(outside, 'canary.txt'), join(workspace, 'escape-link.txt'), 'file')
    await symlink(join(workspace, 'nested'), join(workspace, 'internal-link'), process.platform === 'win32' ? 'junction' : 'dir')
    const calls = []
    const denied = /Security workspace boundary/
    for (const path of [join(outside, 'canary.txt'), '../workspace-neighbor/canary.txt', 'escape-junction/canary.txt', 'escape-link.txt', 'internal-link/safe.txt']) {
      calls.push(['read', { file_path: path }, denied])
    }
    for (const name of ['glob', 'grep']) {
      for (const path of [outside, '../workspace-neighbor', 'escape-junction', 'internal-link']) {
        calls.push([name, { pattern: name === 'glob' ? '**/*' : 'needle', path }, denied])
      }
    }
    if (process.platform === 'win32') {
      calls.push(['read', { file_path: '..\\workspace-neighbor\\canary.txt' }, denied])
      calls.push(['read', { file_path: join(workspace, 'nested', 'safe.txt') + ':stream' }, denied])
      calls.push(['read', { file_path: '\\\\?\\' + join(outside, 'canary.txt') }, denied])
    }
    calls.push(['read', { file_path: 'nested/safe.txt' }, new RegExp(internal)])
    calls.push(['read', { file_path: join(workspace, 'nested', 'safe.txt'), offset: 2, limit: 1 }, /2: second line/])
    calls.push(['read', { file_path: 'nested/../nested/safe.txt' }, new RegExp(internal)])
    calls.push(['glob', { pattern: '**/*.txt' }, /nested\/safe.txt/])
    calls.push(['grep', { pattern: 'needle' }, new RegExp(internal)])
    calls.push(['read', { file_path: 'nested/safe.txt', limit: -1 }, /Invalid line offset/])
    let requests = 0, parent, seenTools
    class Scripted extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model } }
      async *stream(options) {
        const names = options.tools.map(tool => tool.name).sort()
        seenTools = names
        assert.deepEqual(names, ['complete_codex_security_scan', 'glob', 'grep', 'read', 'record_codex_security_scan_draft', 'security_progress'])
        const messages = JSON.stringify(options.messages)
        assert.ok(!messages.includes(secret), 'Outside content must never enter any provider request')
        if (requests > 0) {
          // Inspect only the latest tool response, so earlier success cannot hide failure.
          const last = [...options.messages].reverse().find(message => message.role === 'tool')
          assert.ok(last, 'Real tool result must return through the loop')
          assert.match(JSON.stringify(last), calls[requests - 1][2])
        }
        const call = calls[requests++]
        if (call) {
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `boundary-${requests}`, name: call[0], arguments: JSON.stringify(call[1]) } }
          yield { type: 'finish', reason: { kind: 'tool-calls' } }
        } else {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic boundary probe finished.' } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
      }
    }
    const ctx = new Context()
    try {
      for (const Plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(Plugin)
      await ctx.plugin(SandboxPolicy, { mode: 'read-only', workspaceRoot: workspace })
      await ctx.plugin(AgentLoop, { agents: [] })
      const presetKey = {}
      let presetScope
      await ctx.plugin(Object.assign(inner => { presetScope = createScope(inner, presetKey) }, { inject: ['tools', 'systemPrompt'] }))
      const inherited = preset === 'minimal-windows' ? ['pwsh'] : ['read', 'glob', 'grep', 'pwsh', 'write', 'web_fetch']
      for (const name of inherited) presetScope.ctx.tools.register(defineTool({ name, description: 'Parent-only fixture; must never run in scanner', parameters: {},
        output: { schema: { type: 'string' }, render: () => [] }, execute: async () => assert.fail('Inherited tool executed') }))
      if (preset === 'standard') for (const name of inherited) ctx.tools.register(defineTool({ name, description: 'Ambient global fixture; must never run in scanner', parameters: {},
        output: { schema: { type: 'string' }, render: () => [] }, execute: async () => assert.fail('Ambient global tool executed') }))
      ctx.provide('agentPresets', {
        composeFrom() { assert.fail('Scanner must not inherit the parent preset') },
        async mount() { assert.fail('Scanner must not mount an ambient preset') },
      })
      parent = await ctx.agents.create({ sessionId: `parent-${preset}`, meta: { cwd: workspace },
        agentOptions: { provider: 'synthetic', model: 'no-network' },
        setup: scope => { bindScopeParent(scopeOf(scope), presetKey) },
      })
      ctx.llm.registerAdapter(['synthetic'], new Scripted())
      const driver = new DshScanDriver(ctx, { async start() { return { scanId: 'synthetic-scan', handoffClaimToken: 'synthetic-claim' } } })
      await assert.rejects(driver.run({ id: `scan-${preset}`, sessionId: parent.agent.session.id, workspace, provider: 'synthetic', model: 'no-network' },
        { signal: new AbortController().signal, async update() {} }), error => {
          if (requests !== calls.length + 1) throw error
          return /DSH/.test(error.message)
        })
      assert.equal(requests, calls.length + 1, 'Every path probe must reach the next provider request')
      assert.ok(seenTools.includes('read'))
      const evidence = { preset, requests, toolCalls: calls.length, toolsSeen: seenTools, outsideReachedModel: false, liveNetworkRequests: 0, symlinkAndJunctionCreated: true }
      await writeFile(join(root, 'boundary-result.json'), JSON.stringify(evidence, null, 2))
      console.log(JSON.stringify({ evidence: join(root, 'boundary-result.json'), ...evidence }))
    } finally { await parent?.dispose(); await ctx.fiber.dispose() }
  })
}
