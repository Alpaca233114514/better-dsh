// ============================================================================
// Token Meter 计量插件 — Host 半区源码
// 插件 ID: tkmtr-2   Package: pkg-14
// 说明: 这是 cordis_define 的 code.host 函数体。把它作为 code.host 传入即可。
// 功能: 包装 llm/stream 瀑布捕获每次模型调用的 usage chunk，
//       输入 token 含缓存命中（prompt_tokens = inputTokens + cacheReadTokens），
//       用 agent/inbox/claimed → agent/turn-stopping 配对统计每轮峰值与时长，
//       数据持久化到会话工作区 .dsh-token-meter.json（重启不丢失）。
// ============================================================================
return {
  inject: ['timer'],
  apply(ctx) {
    const fs = ctx.get('fs')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    let fileTarget = null
    let root = null
    let rootSource = null
    let dirty = false

    const state = {
      totalInput: 0,          // 输入（含缓存命中）
      totalCacheRead: 0,      // 其中缓存命中
      totalOutput: 0,
      peakRoundTokens: 0,
      peakRoundDate: null,
      longestRoundMs: 0,
      longestRoundDate: null,
      daily: {},              // 'YYYY-MM-DD' -> { input, cache, output }
    }
    const activeRounds = new Map()

    function dateKey(at) {
      const d = new Date(at)
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return d.getFullYear() + '-' + m + '-' + day
    }

    // 收集所有候选可写根：活跃会话 cwd（去重，新会话优先）+ 沙箱策略根（实例稳定）
    function collectRoots() {
      const roots = []
      const seen = new Set()
      const push = (r) => {
        if (r && !seen.has(r)) { seen.add(r); roots.push(r) }
      }
      try {
        const sessions = ctx.get('sessions')
        if (sessions) {
          const all = sessions.list()
          for (let i = all.length - 1; i >= 0; i--) {
            const cwd = all[i] && all[i].header && all[i].header.cwd
            if (cwd) push(cwd)
          }
        }
      } catch (err) { /* ignore */ }
      try {
        const agents = ctx.get('agents')
        if (agents) {
          const all = agents.list()
          for (let i = all.length - 1; i >= 0; i--) {
            const cwd = all[i] && all[i].session && all[i].session.header && all[i].session.header.cwd
            if (cwd) push(cwd)
          }
        }
      } catch (err) { /* ignore */ }
      try {
        if (sandboxPolicy && sandboxPolicy.workspaceRoot) push(sandboxPolicy.workspaceRoot)
      } catch (err) { /* ignore */ }
      return roots
    }

    // 1) 找出所有已有数据文件（新会话优先排在前面）
    async function findExistingTarget() {
      if (!fs) return []
      const files = []
      for (const r of collectRoots()) {
        try {
          const t = await fs.resolve('.dsh-token-meter.json', { cwd: r })
          const info = await fs.stat(t)
          if (info) files.push({ root: r, fileTarget: t })
        } catch (err) { /* 该根下无数据文件，继续找 */ }
      }
      return files
    }

    // 从另一份数据文件吸收增量：两份同源累计（同一插件实例），
    // 各项取最大值即为正确合并（迁移/续接场景不丢数据）
    async function absorbFrom(other) {
      if (!fs) return
      try {
        const text = await fs.readText(other.fileTarget)
        const p = JSON.parse(text)
        if (!p || typeof p !== 'object') return
        const num = (v) => Number(v) || 0
        state.totalInput = Math.max(state.totalInput, num(p.totalInput))
        state.totalCacheRead = Math.max(state.totalCacheRead, num(p.totalCacheRead))
        state.totalOutput = Math.max(state.totalOutput, num(p.totalOutput))
        if (num(p.peakRoundTokens) > state.peakRoundTokens) {
          state.peakRoundTokens = num(p.peakRoundTokens)
          state.peakRoundDate = p.peakRoundDate || null
        }
        if (num(p.longestRoundMs) > state.longestRoundMs) {
          state.longestRoundMs = num(p.longestRoundMs)
          state.longestRoundDate = p.longestRoundDate || null
        }
        if (p.daily && typeof p.daily === 'object') {
          for (const [k, v] of Object.entries(p.daily)) {
            if (!v || typeof v !== 'object') continue
            const cur = state.daily[k] || (state.daily[k] = { input: 0, cache: 0, output: 0 })
            cur.input = Math.max(cur.input, num(v.input))
            cur.cache = Math.max(cur.cache, num(v.cache))
            cur.output = Math.max(cur.output, num(v.output))
          }
        }
        dirty = true
        console.log('[token-meter] absorbed data from', other.root)
      } catch (err) {
        console.error('[token-meter] absorb failed:', err && err.message ? err.message : err)
      }
    }

    // 2) 退回：优先实例稳定的沙箱策略根（= dsh 启动目录，重启不变），
    //    再退回活跃会话的工作区 cwd
    function pickRoot() {
      try {
        if (sandboxPolicy && sandboxPolicy.workspaceRoot) {
          rootSource = 'sandboxPolicy'
          return sandboxPolicy.workspaceRoot
        }
      } catch (err) { /* ignore */ }
      try {
        const sessions = ctx.get('sessions')
        if (sessions) {
          for (const s of sessions.list()) {
            const cwd = s && s.header && s.header.cwd
            if (cwd) { rootSource = 'sessions'; return cwd }
          }
        }
      } catch (err) { /* ignore */ }
      try {
        const agents = ctx.get('agents')
        if (agents) {
          for (const a of agents.list()) {
            const cwd = a && a.session && a.session.header && a.session.header.cwd
            if (cwd) { rootSource = 'agents'; return cwd }
          }
        }
      } catch (err) { /* ignore */ }
      rootSource = null
      return null
    }

    async function ensureTarget(preferred) {
      if (fileTarget || !fs) return
      // 1) 已有数据文件 → 主用第一个（新会话优先），其余文件只吸收增量后弃用
      const files = await findExistingTarget()
      if (files.length > 0) {
        root = files[0].root
        rootSource = 'existing-data'
        fileTarget = files[0].fileTarget
        await load()
        for (let i = 1; i < files.length; i++) {
          await absorbFrom(files[i])
        }
        if (dirty) scheduleSave()
        return
      }
      // 2) 否则取稳定根
      const r = preferred || pickRoot()
      if (!r) return
      try {
        root = r
        fileTarget = await fs.resolve('.dsh-token-meter.json', { cwd: r })
        await load()
      } catch (err) {
        fileTarget = null
        root = null
        console.error('[token-meter] resolve failed:', err && err.message ? err.message : err)
      }
    }

    async function load() {
      if (!fs || !fileTarget) return
      try {
        const info = await fs.stat(fileTarget)
        if (!info) return
        const text = await fs.readText(fileTarget)
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object') return
        state.totalInput = Number(parsed.totalInput) || 0
        state.totalCacheRead = Number(parsed.totalCacheRead) || 0
        state.totalOutput = Number(parsed.totalOutput) || 0
        state.peakRoundTokens = Number(parsed.peakRoundTokens) || 0
        state.peakRoundDate = parsed.peakRoundDate || null
        state.longestRoundMs = Number(parsed.longestRoundMs) || 0
        state.longestRoundDate = parsed.longestRoundDate || null
        state.daily = {}
        if (parsed.daily && typeof parsed.daily === 'object') {
          for (const [k, v] of Object.entries(parsed.daily)) {
            if (v && typeof v === 'object') {
              state.daily[k] = {
                input: Number(v.input) || 0,
                cache: Number(v.cache) || 0,
                output: Number(v.output) || 0,
              }
            }
          }
        }
        prune()
      } catch (err) {
        console.error('[token-meter] load failed:', err && err.message ? err.message : err)
      }
    }

    async function save() {
      if (!fs || !fileTarget || !root) return
      try {
        await fs.writeText(fileTarget, JSON.stringify(state), undefined, undefined, {
          mode: 'workspace-write',
          workspaceRoot: root,
        })
        dirty = false
      } catch (err) {
        console.error('[token-meter] save failed:', err && err.message ? err.message : err)
      }
    }

    function prune() {
      const cut = dateKey(Date.now() - 400 * 86400000)
      for (const k of Object.keys(state.daily)) {
        if (k < cut) delete state.daily[k]
      }
    }

    const scheduleSave = ctx.debounce(() => { save() }, 1500)

    function recordUsage(sessionId, usage, at) {
      // 输入包含缓存命中（prompt_tokens = inputTokens + cacheReadTokens）
      const input = (Number(usage.inputTokens) || 0) + (Number(usage.cacheReadTokens) || 0)
      const cache = Number(usage.cacheReadTokens) || 0
      const output = Number(usage.outputTokens) || 0
      if (input + output <= 0) return
      state.totalInput += input
      state.totalCacheRead += cache
      state.totalOutput += output
      const key = dateKey(at)
      const entry = state.daily[key] || (state.daily[key] = { input: 0, cache: 0, output: 0 })
      entry.input += input
      entry.cache += cache
      entry.output += output
      if (sessionId) {
        const round = activeRounds.get(sessionId)
        if (round) round.tokens += input + output
      }
      dirty = true
      if (!fileTarget) ensureTarget()
      scheduleSave()
    }

    // ---- 1. 包装每次流式模型调用，捕获 usage chunk ----
    ctx.on('llm/stream', (options, next) => {
      const inner = next()
      let usage = null
      async function* wrapped() {
        try {
          for await (const chunk of inner) {
            if (chunk && chunk.type === 'usage' && chunk.usage) usage = chunk.usage
            yield chunk
          }
        } finally {
          if (usage) {
            recordUsage(options.sessionId, usage, Date.now())
          }
        }
      }
      return wrapped()
    })

    // ---- 2. 轮次起点：用户消息被领取 ----
    ctx.on('agent/inbox/claimed', (payload) => {
      const id = payload.agent.id
      const cur = activeRounds.get(id)
      if (!cur || cur.turn !== payload.turn) {
        activeRounds.set(id, { turn: payload.turn, startedAt: Date.now(), tokens: 0 })
      }
    })

    // ---- 3. 轮次终点：更新最长时长与单轮峰值 ----
    ctx.on('agent/turn-stopping', (payload) => {
      const id = payload.agent.id
      const round = activeRounds.get(id)
      if (round && round.turn === payload.turn) {
        const now = Date.now()
        const dur = now - round.startedAt
        if (dur > state.longestRoundMs) {
          state.longestRoundMs = dur
          state.longestRoundDate = dateKey(now)
        }
        if (round.tokens > state.peakRoundTokens) {
          state.peakRoundTokens = round.tokens
          state.peakRoundDate = dateKey(now)
        }
        activeRounds.delete(id)
        dirty = true
        scheduleSave()
      }
    })

    // agent 出现后补解析可写根目录
    ctx.on('agent/created', (payload) => {
      const cwd = payload && payload.agent && payload.agent.session && payload.agent.session.header && payload.agent.session.header.cwd
      if (cwd) ensureTarget(cwd)
    })

    // ---- 4. 心跳：有变更时才落盘（保证异常退出不丢数据） ----
    ctx.interval(() => {
      if (dirty) {
        save()
      } else if (!fileTarget) {
        ensureTarget()
      }
    }, 10000)

    // ---- 5. Client RPC ----
    function buildState() {
      const today = dateKey(Date.now())
      const t = state.daily[today]
      const mk = (input, cache, output) => ({
        input,
        cacheRead: cache,
        output,
        total: input + output,
      })
      return {
        cumulative: mk(state.totalInput, state.totalCacheRead, state.totalOutput),
        today: mk(t ? t.input : 0, t ? t.cache : 0, t ? t.output : 0),
        peakRoundTokens: state.peakRoundTokens,
        peakRoundDate: state.peakRoundDate,
        longestRoundMs: state.longestRoundMs,
        longestRoundDate: state.longestRoundDate,
        daily: state.daily,
        generatedAt: Date.now(),
      }
    }

    harness.handle('meter:state', () => buildState())
    harness.handle('meter:diag', () => ({
      root,
      rootSource,
      fileTargetReady: !!fileTarget,
      totalInput: state.totalInput,
      totalCacheRead: state.totalCacheRead,
      totalOutput: state.totalOutput,
      dailyDays: Object.keys(state.daily).length,
      activeRounds: activeRounds.size,
      dirty,
      now: Date.now(),
    }))
    harness.handle('meter:reset', () => {
      state.totalInput = 0
      state.totalCacheRead = 0
      state.totalOutput = 0
      state.peakRoundTokens = 0
      state.peakRoundDate = null
      state.longestRoundMs = 0
      state.longestRoundDate = null
      state.daily = {}
      activeRounds.clear()
      dirty = true
      save()
      return buildState()
    })

    // 启动时解析根目录；停止时冲刷待写数据
    ctx.effect(() => {
      ensureTarget()
      return () => {
        scheduleSave.dispose()
        if (dirty) save()
      }
    })
  },
}
