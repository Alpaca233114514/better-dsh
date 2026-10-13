// ============================================================================
// Better Manager — 插件管理器（Host 半区源码）
// 说明: 这是 cordis_define 的 code.host 函数体。把它作为 code.host 传入即可。
// 功能: 永久持久化 —— 把 DSH 动态插件注册表（含全部 Package 源码与启用状态）
//       快照到工作区根目录 .better-manager-plugins.json；进程重启后注册表为空时
//       自动从快照重建全部插件定义（由 DSH 分配新身份），防止插件丢失。
// 依赖: dynamicCordisRunner 的 define() / inspectPackage() 公共接口，
//       fs 读写快照文件（workspace-write 沙箱），timer 做周期保存。
// ============================================================================
return {
  inject: ['timer', 'fs', 'dynamicCordisRunner', 'agents', 'sessions', 'sandboxPolicy'],
  apply(ctx) {
    const fs = ctx.get('fs')
    const runner = ctx.get('dynamicCordisRunner')
    const agents = ctx.get('agents')
    const sessions = ctx.get('sessions')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const SELF_MARKER = 'better-manager-dsh-0.2'
    let ownerId = null
    let selfId = null
    const restoredFrom = new Map()
    const restoredSnapshots = new Map()
    const pendingPackages = new Map()
    const restoreProgress = new Map()
    let operation = Promise.resolve()
    let restoreError = null

    // 保存与恢复串行，避免周期保存抢在恢复之前覆盖旧快照。
    function enqueue(fn) {
      const job = operation.then(fn)
      operation = job.catch(() => {})
      return job
    }

    function isManager(code) {
      return typeof code === 'string' && code.includes("harness.handle('bm:list'")
    }

    let root = null
    let rootSource = null
    let storePath = null
    let lastSavedSig = null
    let justRestored = false       // 本次进程恢复过定义（供 Client 展示运行清单）
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
    // 插件身份由 DSH 分配。通过公开源码检查识别正在启动的本插件，
    // 不依赖 plcntr-3，也不在多个管理器之间猜测归属。
    async function pickRoot() {
      const candidates = []
      for (const row of await runner.inventory()) {
        const agent = agents.get(row.agentId)
        if (!agent) continue
        const packageId = row.nextPackageId || row.currentPackageId || (row.packages.at(-1) || {}).packageId
        if (!packageId) continue
        const pkg = runner.inspectPackage(agent, row.pluginId, packageId)
        if (pkg.code.host && pkg.code.host.includes(SELF_MARKER) &&
            (row.activeRun || (row.latestRun && row.latestRun.status === 'starting-host'))) {
          candidates.push(row)
        }
      }
      if (candidates.length !== 1) throw new Error('无法唯一识别 Better Manager；同一实例请只运行一个管理器')
      const me = candidates[0]
      const session = sessions.get(me.agentId)
      if (!session || !session.header.cwd) throw new Error('管理器所属会话工作区不可用')
      ownerId = me.agentId
      selfId = me.pluginId
      rootSource = 'self-session'
      return session.header.cwd
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
      const session = sessions.get(ownerId)
      if (!session) throw new Error('管理器所属会话已关闭')
      const resolved = sandboxPolicy.resolve({ session })
      return { ...resolved, mode: resolved.mode === 'read-only' ? 'read-only' : 'workspace-write' }
    }

    function errText(err) {
      return err && err.message ? err.message : String(err)
    }

    // ---------- 所属会话 id（恢复出的插件归管理器所属会话所有） ----------
    async function currentSessionId() {
      await ensureRoot()
      if (!agents.get(ownerId)) throw new Error('管理器所属 Agent 不可用')
      return ownerId
    }

    // ---------- 快照文件读写 ----------
    async function readStore() {
      if (!fs || !storePath) return null
      try {
        const info = await fs.stat(storePath)
        if (!info) return null
        const text = await fs.readText(storePath)
        const parsed = JSON.parse(text)
        if (!parsed || !Array.isArray(parsed.plugins) || ![1, 2].includes(parsed.version)) {
          throw new Error('快照格式或版本不支持')
        }
        return parsed
      } catch (err) { throw new Error('读取快照失败：' + errText(err)) }
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
      return s === 'running' || s === 'client-pending' || s === 'starting-host' || s === 'waiting' ||
        (!row.latestRun && pendingPackages.has(row.pluginId))
    }

    function packageCodeOf(row, packageId) {
      const agent = agents.get(row.agentId)
      if (!agent) throw new Error('无法读取 ' + row.pluginId + ' 的所属会话；保留旧快照')
      const pkg = runner.inspectPackage(agent, row.pluginId, packageId)
      return { name: pkg.name, purpose: pkg.purpose, host: pkg.code.host || null, client: pkg.code.client || null }
    }

    function matchesSnapshot(row, snapshot) {
      return row && Array.isArray(snapshot.packages) && row.packages.length === snapshot.packages.length &&
        row.packages.every((pkg, index) => {
          const code = packageCodeOf(row, pkg.packageId)
          const saved = snapshot.packages[index]
          return code.host === (saved.host || null) && code.client === (saved.client || null)
        })
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
      if (restoreError) return { ok: false, error: restoreError, count: 0 }
      await readStore() // 损坏的旧快照不能被心跳覆盖。
      const plugins = reg.rows.map((row) => {
        const pkgs = (row.packages || []).map((p) => {
          const code = packageCodeOf(row, p.packageId)
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
          sourcePluginId: restoredFrom.get(row.pluginId) || row.pluginId,
          name: (pkg && pkg.name) || row.pluginId,
          purpose: (pkg && pkg.purpose) || '',
          enabled: enabledOf(row),
          currentPackageId: row.currentPackageId || pendingPackages.get(row.pluginId) || null,
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
      const ok = await writeStore({ version: 2, savedAt: Date.now(), root, plugins })
      if (ok) lastSavedSig = sig
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
      const sessionId = await currentSessionId()
      const restoredIds = []
      const runPlan = []
      const errors = []
      const idMap = {}
      for (const p of store.plugins) {
        if (!p || !p.pluginId) continue
        // sourcePluginId 是历史来源记录，不能充当恢复键：ID 被复用时，
        // 两个不同的快照条目可能有同一个来源。按当前条目 ID 与完整源码匹配。
        const sourceId = p.pluginId
        const restoredRow = reg.rows.find((row) => row.pluginId === restoredSnapshots.get(sourceId))
        if (matchesSnapshot(restoredRow, p)) continue
        // 重新加载的管理器已有新身份，不恢复快照中的旧管理器副本。
        if ((p.packages || []).some((pkg) => isManager(pkg.host))) { idMap[p.pluginId] = selfId; continue }
        // 进程重启后 id 计数重新开始；相同 id 并不证明它是快照中的插件。
        const sameId = reg.rows.find((row) => row.pluginId === p.pluginId)
        if (matchesSnapshot(sameId, p)) continue
        try {
          const prefix = (p.pluginId.match(/^([a-z]{3,6})-/) || [])[1] || 'plugin'
          const progress = restoreProgress.get(sourceId) || { pluginId: null, receipts: [] }
          restoreProgress.set(sourceId, progress)
          let pluginId = progress.pluginId
          let selected = null
          const receipts = progress.receipts
          // 先检查全部版本，避免源码不完整时创建无法使用的半个插件。
          if (!Array.isArray(p.packages) || !p.packages.length || p.packages.some((pkg) =>
            (!pkg.host && !pkg.client) || (pkg.hasHostHalf && !pkg.host) || (pkg.hasClientHalf && !pkg.client))) {
            throw new Error('快照缺少完整源码')
          }
          for (const [index, pkg] of p.packages.entries()) {
            if (index < receipts.length) {
              if (pkg.packageId === p.currentPackageId) selected = receipts[index]
              continue
            }
            const code = {}
            if (pkg.host) code.host = pkg.host
            if (pkg.client) code.client = pkg.client
            if (!code.host && !code.client) continue
            const receipt = await runner.define({
              sessionId,
              plugin: pluginId ? { kind: 'existing', pluginId } : { kind: 'new', idPrefix: prefix },
              name: pkg.name || p.name || p.pluginId,
              purpose: pkg.purpose || p.purpose || '从 Better Manager 快照恢复插件',
              code,
            })
            pluginId = receipt.pluginId
            progress.pluginId = pluginId
            const mapped = { packageId: receipt.packageId, hasClientHalf: receipt.hasClientHalf }
            receipts.push(mapped)
            if (pkg.packageId === p.currentPackageId) selected = mapped
          }
          restoredFrom.set(pluginId, p.sourcePluginId || sourceId)
          restoredSnapshots.set(sourceId, pluginId)
          restoreProgress.delete(sourceId)
          idMap[p.pluginId] = pluginId
          restoredIds.push(pluginId)
          selected = selected || receipts.at(-1)
          if (p.enabled && selected) {
            pendingPackages.set(pluginId, selected.packageId)
            runPlan.push({ pluginId, packageId: selected.packageId, hasClientHalf: selected.hasClientHalf })
          }
        } catch (err) {
          console.error('[better-manager] restore failed for', p.pluginId, errText(err))
          errors.push({ pluginId: p.pluginId, message: errText(err) })
        }
      }
      restoreError = errors.length ? errors.map((e) => e.pluginId + '：' + e.message).join('；') : null
      // 重试部分失败时，之前已恢复的已启用插件也保留在用户运行清单中。
      for (const [pluginId, packageId] of pendingPackages) {
        if (runPlan.some((entry) => entry.pluginId === pluginId)) continue
        const row = (await runner.inventory()).find((item) => item.pluginId === pluginId)
        const pkg = row && row.packages.find((item) => item.packageId === packageId)
        if (pkg && !row.latestRun) runPlan.push({ pluginId, packageId, hasClientHalf: pkg.hasClientHalf })
      }
      return { ok: errors.length === 0, error: restoreError,
        restored: restoredIds.length, restoredIds, runPlan, idMap, errors }
    }

    // 自动恢复：把快照里「缺失」的插件补回注册表（幂等，已存在的跳过）。
    // 重新加载后注册表已有管理器的新身份，不能以注册表完全为空为条件。
    async function autoRestore() {
      const res = await restoreFromStore()
      if (res.ok && res.restored > 0) {
        justRestored = true
        lastRunPlan = res.runPlan || []
      }
      return { ...res, autoRestored: justRestored }
    }

    // ---------- RPC ----------
    // 注意：harness.handle 返回值必须是纯 JSON，任何 undefined 字段都会被拒绝。
    harness.handle('bm:list', async () => {
      const reg = await currentRegistry()
      const store = await readStore()
      return {
        ok: reg.ok,
        rows: reg.rows,
        error: reg.error || restoreError || null,
        ownerId,
        autoRestored: justRestored,
        runPlan: justRestored ? lastRunPlan : [],
        store: store
          ? { savedAt: store.savedAt || null, count: Array.isArray(store.plugins) ? store.plugins.length : 0, root: store.root || null }
          : null,
      }
    })

    harness.handle('bm:save', (args) => enqueue(() => saveSnapshot({ force: !!(args && args.force) })))
    harness.handle('bm:restore', () => enqueue(() => restoreFromStore()))
    harness.handle('bm:autoRestoreNow', () => enqueue(() => autoRestore()))
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
      // 进程重启（注册表为空）时自动恢复定义，防止插件丢失
      enqueue(async () => {
        const res = await autoRestore()
        if (!res.ok) throw new Error(res.error)
        await saveSnapshot()
      }).catch((err) => console.error('[better-manager] startup:', errText(err)))
      // 周期保存（注册表变化时自动落盘）
      const timer = ctx.interval(() => { enqueue(() => saveSnapshot()) }, 10000)
      return () => {
        timer()
        enqueue(() => saveSnapshot())
      }
    })
  },
}
