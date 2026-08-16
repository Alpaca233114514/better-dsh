// ============================================================================
// Better Manager — 插件管理器（Host 半区源码）
// 说明: 这是 cordis_define 的 code.host 函数体。把它作为 code.host 传入即可。
// 功能: 永久持久化 —— 把 DSH 动态插件注册表（含全部 Package 源码与启用状态）
//       快照到工作区根目录 .better-manager-plugins.json；进程重启后注册表为空时
//       自动从快照重建全部插件定义（保留原 pluginId），防止插件丢失。
// 依赖: ctx.get('dynamicCordisRunner') 的 define() / registry（读取源码、重建定义），
//       fs 读写快照文件（workspace-write 沙箱），timer 做周期保存。
// ============================================================================
return {
  inject: ['timer'],
  apply(ctx) {
    const fs = ctx.get('fs')
    const runner = ctx.get('dynamicCordisRunner')

    let root = null
    let rootSource = null
    let storePath = null
    let debugPath = null
    let lastSavedSig = null
    let justRestored = false       // 本次进程自动恢复过（供 Client 决定是否自动运行）
    let lastRunPlan = []           // 最近一次恢复产生的「待运行」清单

    // 调试落盘（排查持久化问题时用，正常使用无影响）
    async function debugLog(obj) {
      if (!fs || !root) return
      try {
        const target = await fs.resolve('.better-manager-debug.json', { cwd: root })
        await fs.writeText(target, JSON.stringify({ at: Date.now(), ...obj }, null, 2), undefined, undefined, policy())
      } catch (err) { /* ignore */ }
    }

    // ---------- 工作区根目录解析 ----------
    // 关键：必须取「当前会话」的工作区，而不是 sessions.list() 的第一个会话
    // （那可能是别的 workspace，导致快照写错地方）。最可靠：从注册表找到
    // 本插件自己的记录，其 agentId 就是当前会话 id。
    async function pickRoot() {
      try {
        const rows = await runner.inventory()
        const me = (rows || []).find((r) => r.pluginId === 'plcntr-3')
        if (me && me.agentId) {
          const sessions = ctx.get('sessions')
          const s = sessions && sessions.get(me.agentId)
          const cwd = s && s.header && s.header.cwd
          if (cwd) { rootSource = 'self-session'; return cwd }
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
      try {
        const sandboxPolicy = ctx.get('sandboxPolicy')
        if (sandboxPolicy && sandboxPolicy.workspaceRoot) {
          rootSource = 'sandboxPolicy'
          return sandboxPolicy.workspaceRoot
        }
      } catch (err) { /* ignore */ }
      rootSource = null
      return null
    }

    async function ensureRoot() {
      if (root) return root
      const r = await pickRoot()
      if (!r) return null
      root = r
      storePath = await fs.resolve('.better-manager-plugins.json', { cwd: root })
      return root
    }

    function policy() {
      return { mode: 'workspace-write', workspaceRoot: root }
    }

    function errText(err) {
      return err && err.message ? err.message : String(err)
    }

    // ---------- 当前会话 id（恢复出的插件归本会话所有） ----------
    // 与 pickRoot 同思路：从注册表找本插件自己的记录，其 agentId 就是当前会话。
    function currentSessionId() {
      try {
        const rows = runner.inventory()
        const me = (rows || []).find((r) => r.pluginId === 'plcntr-3')
        if (me && me.agentId) return me.agentId
      } catch (err) { /* ignore */ }
      try {
        const agents = ctx.get('agents')
        if (agents) {
          for (const a of agents.roots()) {
            if (a && a.id) return a.id
          }
          for (const a of agents.list()) {
            if (a && a.id) return a.id
          }
        }
      } catch (err) { /* ignore */ }
      try {
        const sessions = ctx.get('sessions')
        if (sessions) {
          for (const s of sessions.list()) {
            if (s && s.id) return s.id
          }
        }
      } catch (err) { /* ignore */ }
      return null
    }

    // ---------- 快照文件读写 ----------
    async function readStore() {
      if (!fs || !storePath) return null
      try {
        const info = await fs.stat(storePath)
        if (!info) return null
        const text = await fs.readText(storePath)
        const parsed = JSON.parse(text)
        return parsed && typeof parsed === 'object' ? parsed : null
      } catch (err) {
        return null
      }
    }

    async function writeStore(data) {
      if (!fs || !storePath) return false
      try {
        await fs.writeText(storePath, JSON.stringify(data, null, 2), undefined, undefined, policy())
        return true
      } catch (err) {
        console.error('[better-manager] save failed:', errText(err))
        return false
      }
    }

    // ---------- 注册表读取 ----------
    async function currentRegistry() {
      if (!runner) return { ok: false, error: 'dynamicCordisRunner 不可用', rows: [] }
      try {
        const rows = await runner.inventory()
        return { ok: true, rows: rows || [] }
      } catch (err) {
        return { ok: false, error: '读取注册表失败：' + errText(err), rows: [] }
      }
    }

    function enabledOf(row) {
      if (row.activeRun) return true
      const s = row.latestRun && row.latestRun.status
      return s === 'running' || s === 'client-pending' || s === 'starting-host' || s === 'waiting'
    }

    // 从注册表内部读取某 Package 的完整源码（best-effort，读不到返回 null）
    function packageCodeOf(pluginId, packageId) {
      try {
        const plugin = runner.registry.get(pluginId)
        if (!plugin || !plugin.packages) return null
        const def = plugin.packages.get(packageId)
        if (!def) return null
        return {
          name: def.name || '',
          purpose: def.purpose || '',
          host: def.hostCode || null,
          client: def.clientCode || null,
        }
      } catch (err) {
        return null
      }
    }

    // ---------- 保存快照 ----------
    async function saveSnapshot(opts) {
      try {
        const force = !!(opts && opts.force)
        const r = await ensureRoot()
        if (!r || !runner) {
          const why = !r ? 'no-root' : 'no-runner'
          debugLog({ step: 'save-bail', why, runnerReady: !!runner, fsReady: !!fs, root })
          return { ok: false, error: 'root 或 runner 不可用', count: 0 }
        }
        const reg = await currentRegistry()
        if (!reg.ok) {
          debugLog({ step: 'save-bail', why: 'registry', error: reg.error })
          return { ok: false, error: reg.error, count: 0 }
        }
      const plugins = reg.rows.map((row) => {
        const pkgs = (row.packages || []).map((p) => {
          const code = packageCodeOf(row.pluginId, p.packageId) || {}
          return {
            packageId: p.packageId,
            name: code.name || p.name,
            purpose: code.purpose || p.purpose,
            hasHostHalf: p.hasHostHalf,
            hasClientHalf: p.hasClientHalf,
            host: code.host,
            client: code.client,
          }
        })
        const pkg = pkgs[pkgs.length - 1]
        return {
          pluginId: row.pluginId,
          name: (pkg && pkg.name) || row.pluginId,
          purpose: (pkg && pkg.purpose) || '',
          enabled: enabledOf(row),
          currentPackageId: row.currentPackageId || null,
          packages: pkgs,
        }
      })
      const sig = JSON.stringify(plugins)
      if (!force && sig === lastSavedSig) return { ok: true, unchanged: true, count: plugins.length }
      // 防误删：自动保存时，注册表为空且快照里本来有插件 -> 跳过（不覆盖旧快照）
      if (!force && plugins.length === 0) {
        const store = await readStore()
        if (store && Array.isArray(store.plugins) && store.plugins.length > 0) {
          return { ok: true, unchanged: true, count: 0, skippedEmpty: true }
        }
      }
      const ok = await writeStore({ version: 1, savedAt: Date.now(), root, plugins })
      if (ok) lastSavedSig = sig
      debugLog({ step: 'save-done', ok, count: plugins.length, savedAt: ok ? Date.now() : null })
      return { ok, count: plugins.length, savedAt: ok ? Date.now() : null }
      } catch (err) {
        debugLog({ step: 'save-throw', error: errText(err) })
        return { ok: false, error: errText(err), count: 0 }
      }
    }

    // ---------- 从快照恢复 ----------
    async function restoreFromStore() {
      const r = await ensureRoot()
      if (!r || !runner) return { ok: false, error: 'root 或 runner 不可用', restored: 0 }
      const store = await readStore()
      if (!store || !Array.isArray(store.plugins) || store.plugins.length === 0) {
        return { ok: true, restored: 0, reason: 'no-store' }
      }
      const reg = await currentRegistry()
      if (!reg.ok) return { ok: false, error: reg.error, restored: 0 }
      const existing = new Set(reg.rows.map((x) => x.pluginId))
      const sessionId = currentSessionId()
      const restoredIds = []
      const runPlan = []
      for (const p of store.plugins) {
        if (!p || !p.pluginId || existing.has(p.pluginId)) continue
        try {
          // 用原 pluginId 重建注册表记录（归属当前会话）
          runner.registry.add({
            pluginId: p.pluginId,
            sessionId,
            packages: new Map(),
            approvedClientPackages: new Set(),
            clientVersionUpdatesApproved: false,
          })
          let lastPkg = null
          for (const pkg of p.packages || []) {
            const code = {}
            if (pkg.host) code.host = pkg.host
            if (pkg.client) code.client = pkg.client
            if (!code.host && !code.client) continue
            const receipt = runner.define({
              sessionId,
              plugin: { kind: 'existing', pluginId: p.pluginId },
              name: pkg.name || p.name || p.pluginId,
              purpose: pkg.purpose || p.purpose || '',
              code,
            })
            lastPkg = { packageId: receipt.packageId, hasClientHalf: receipt.hasClientHalf }
          }
          restoredIds.push(p.pluginId)
          if (p.enabled && lastPkg) {
            runPlan.push({ pluginId: p.pluginId, packageId: lastPkg.packageId, hasClientHalf: lastPkg.hasClientHalf })
          }
          existing.add(p.pluginId)
        } catch (err) {
          console.error('[better-manager] restore failed for', p.pluginId, errText(err))
        }
      }
      return { ok: true, restored: restoredIds.length, restoredIds, runPlan }
    }

    // 自动恢复：把快照里「缺失」的插件补回注册表（幂等，已存在的跳过）。
    // 注意：不能用「注册表为空」作条件 —— 重启后用户先加载本插件本身，
    // 注册表里已有 plcntr-3，导致其他插件不会被恢复。
    async function autoRestore() {
      const res = await restoreFromStore()
      if (res.ok && res.restored > 0) {
        justRestored = true
        lastRunPlan = res.runPlan || []
      }
      return { autoRestored: justRestored, restored: res.restored }
    }

    // ---------- RPC ----------
    harness.handle('bm:list', async () => {
      const reg = await currentRegistry()
      const store = await readStore()
      return {
        ok: reg.ok,
        rows: reg.rows,
        error: reg.error,
        autoRestored: justRestored,
        runPlan: justRestored ? lastRunPlan : [],
        store: store
          ? { savedAt: store.savedAt, count: Array.isArray(store.plugins) ? store.plugins.length : 0, root: store.root }
          : null,
      }
    })

    harness.handle('bm:save', (args) => saveSnapshot({ force: !!(args && args.force) }))
    harness.handle('bm:restore', () => restoreFromStore())
    harness.handle('bm:autoRestoreNow', () => autoRestore())
    harness.handle('bm:consumeAutoRestore', () => {
      const plan = lastRunPlan
      justRestored = false
      lastRunPlan = []
      return { consumed: plan }
    })
    harness.handle('bm:diag', async () => {
      const r = await ensureRoot()
      return { root: r, rootSource, storePath: storePath ? storePath.displayPath || null : null, runnerReady: !!runner, fsReady: !!fs, justRestored }
    })

    // ---------- 生命周期 ----------
    ctx.effect(() => {
      ensureRoot()
      // 进程重启（注册表为空）时自动恢复定义，防止插件丢失
      autoRestore()
        .then((res) => { if (res.restored > 0) saveSnapshot({ force: true }) })
        .catch(() => {})
      // 周期保存（注册表变化时自动落盘）
      const timer = ctx.interval(() => { saveSnapshot() }, 10000)
      return () => {
        timer()
        saveSnapshot({ force: true })
      }
    })
  },
}
