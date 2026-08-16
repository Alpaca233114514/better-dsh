// ============================================================================
// Better Manager — 插件管理器（Client 半区源码）
// 说明: 这是 cordis_define 的 code.client 函数体。把它作为 code.client 传入即可。
// 功能: 代替内置的左下角 Cordis 插件面板 —— 以类 MC mod 菜单的卡片网格展示
//       DSH 动态插件注册表（dynamicCordisRunner.inventory），提供开关
//       （运行/停止，startUserRun / stopFromPanel）与删除（undefineFromPanel），
//       可在设置页里隐藏内置的左下角入口与「插件」设置分区；
//       并配合 Host 半区实现永久持久化（保存/恢复快照、自动恢复已启用插件）。
// 数据源: ctx.get('remote').dynamicCordisRunner + ctx.get('dynamicCordisRunner')
//       —— 与内置面板完全同源，即 DSH 自己的插件目录（注册表）。
// ============================================================================
return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    // ---------- DSH 动态插件服务（与内置左下角面板同源） ----------
    // 注意：不能用 ctx.get('remote').dynamicCordisRunner —— remote 命名空间是
    // Cordis 上下文代理，点号路径会以 'remote.dynamicCordisRunner' 全名走守卫，
    // 必须声明 inject 或用 ctx.get('remote.dynamicCordisRunner') 直接取服务键。
    const cordis = ctx.get('remote.dynamicCordisRunner') // inventory / stopFromPanel / undefineFromPanel
    const runner = ctx.get('dynamicCordisRunner')        // startUserRun（运行编排）

    // ---------- 隐去内置入口（同 id + 低优先级覆盖，dispose 后自动恢复） ----------
    let footerHidden = true      // 默认隐藏左下角 Cordis 面板入口
    let footerDisposer = null
    let settingsHidden = false   // 默认保留设置里的「插件」分区（可选隐藏）
    let settingsDisposer = null

    function setFooterHidden(hidden) {
      if (footerDisposer) { footerDisposer(); footerDisposer = null }
      footerHidden = hidden
      if (hidden && slots) {
        footerDisposer = slots.inject('sidebar.footer.action', () => slots.register(
          { name: 'sidebar.footer.action', id: 'cordis-panel', priority: -1000 },
          () => null,
        ))
      }
    }

    function setSettingsHidden(hidden) {
      if (settingsDisposer) { settingsDisposer(); settingsDisposer = null }
      settingsHidden = hidden
      if (hidden && slots) {
        settingsDisposer = slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'plugins', priority: -1000, order: 15 },
          () => null,
        ))
      }
    }

    // ---------- 生命周期：初始状态 + 停止/删除时显式恢复内置入口 ----------
    // 防呆：关闭/删除本插件时，左下角内置 Cordis 入口必须恢复显示。
    // 双保险：1) 插槽注册随 fiber 卸载级联销毁；2) 这里用 ctx.effect 在
    // 卸载时显式 dispose 两个隐藏注册（disposer 幂等，重复调用无副作用）。
    ctx.effect(() => {
      setFooterHidden(true)
      setSettingsHidden(false)
      return () => {
        if (footerDisposer) { footerDisposer(); footerDisposer = null }
        if (settingsDisposer) { settingsDisposer(); settingsDisposer = null }
      }
    })

    // ---------- 包内样式 ----------
    styles.insert(`
.bm-page{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;width:100%;box-sizing:border-box}
.bm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.bm-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}
.bm-sub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.bm-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bm-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.bm-switch{position:relative;width:30px;height:16px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;flex:none;padding:0;transition:background .15s,border-color .15s}
.bm-switch::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:5px;background:var(--dsw-alias-label-secondary);transition:left .15s,background .15s}
.bm-switch.bm-on{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,var(--dsw-alias-bg-layer-2));border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 60%,transparent)}
.bm-switch.bm-on::after{left:16px;background:var(--dsw-alias-state-success-primary)}
.bm-btn{padding:4px 12px;font-size:12px;line-height:20px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-family:inherit}
.bm-btn:hover{border-color:var(--dsw-alias-brand-primary)}
.bm-btn:disabled{opacity:.5;cursor:not-allowed}
.bm-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.bm-btn-danger:hover{border-color:var(--dsw-alias-state-error-primary)}
.bm-confirm{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bm-confirm-ask{font-size:12px;color:var(--dsw-alias-state-warn-primary)}
.bm-status{font-size:12px;color:var(--dsw-alias-label-secondary)}
.bm-error{font-size:12px;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);border-radius:8px;padding:8px 12px}
.bm-store{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent);border-radius:8px;padding:8px 12px}
.bm-msg{font-size:12px;color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,var(--dsw-alias-bg-layer-1));border:1px solid color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,transparent);border-radius:8px;padding:8px 12px}
.bm-btn-primary{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 50%,transparent)}
.bm-loading{color:var(--dsw-alias-label-secondary);font-size:13px;padding:32px 0;text-align:center}
.bm-empty{color:var(--dsw-alias-label-secondary);font-size:13px;padding:32px 12px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}
.bm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.bm-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0;transition:border-color .15s}
.bm-card:hover{border-color:var(--dsw-alias-border-l2)}
.bm-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.bm-card-main{min-width:0;display:flex;flex-direction:column;gap:2px}
.bm-name{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all;line-height:1.35}
.bm-id{font-size:11px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
.bm-purpose{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.55;min-height:36px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bm-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.bm-badge{font-size:10px;line-height:16px;padding:0 7px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.bm-badge.bm-ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent)}
.bm-badge.bm-warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent)}
.bm-badge.bm-err{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}
.bm-version{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.bm-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:4px}
.bm-actions{display:flex;align-items:center;gap:8px}
.bm-foot{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.7;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}
/* 设置侧边栏导航：自定义方块图标替换默认齿轮 */
.bm-nav-label{display:inline-flex;align-items:center;gap:8px;min-width:0}
.bm-nav-label svg{flex:none}
button:has(.bm-nav-label)>svg{display:none}
`)

    // ---------- 设置侧边栏专用图标（MC 式方块） ----------
    function BlocksIcon() {
      return React.createElement('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
        React.createElement('rect', { x: 1.5, y: 1.5, width: 5.5, height: 5.5, rx: 1, fill: 'currentColor' }),
        React.createElement('rect', { x: 9, y: 1.5, width: 5.5, height: 5.5, rx: 1, fill: 'currentColor', opacity: 0.5 }),
        React.createElement('rect', { x: 1.5, y: 9, width: 5.5, height: 5.5, rx: 1, fill: 'currentColor', opacity: 0.5 }),
        React.createElement('rect', { x: 9, y: 9, width: 5.5, height: 5.5, rx: 1, fill: 'currentColor' }),
      )
    }

    // ---------- 状态推导 ----------
    function statusOf(row) {
      const latest = row.latestRun
      if (latest) {
        const s = latest.status
        if (s === 'awaiting-approval') return { key: 'approval', label: '等待批准', cls: 'warn' }
        if (s === 'failed') return { key: 'failed', label: '运行失败', cls: 'err' }
        if (s === 'running' || s === 'client-pending' || s === 'starting-host' || s === 'waiting') return { key: 'running', label: '运行中', cls: 'ok' }
      }
      if (row.activeRun) return { key: 'running', label: '运行中', cls: 'ok' }
      return { key: 'idle', label: '未运行', cls: '' }
    }

    function errText(err) {
      return err && err.message ? err.message : String(err)
    }

    function fmtTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }

    // ---------- 页面组件 ----------
    function BetterManagerPage(props) {
      const useSessions = props && props.useSessions
      const [rows, setRows] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busyId, setBusyId] = React.useState(null)
      const [confirmRemove, setConfirmRemove] = React.useState(null)
      const [hideFooter, setHideFooter] = React.useState(footerHidden)
      const [hideSettings, setHideSettings] = React.useState(settingsHidden)
      const [store, setStore] = React.useState(null)
      const [msg, setMsg] = React.useState(null)
      const [pendingRun, setPendingRun] = React.useState([])
      const didAutoRun = React.useRef(false)
      const current = useSessions ? useSessions((state) => state.current) : undefined

      const runEnabled = React.useCallback((plan, rowsNow) => {
        if (!runner) { setError('无法运行：dynamicCordisRunner（运行编排器）不可用'); return }
        const list = rowsNow || rows || []
        const jobs = []
        let ran = 0
        let missing = 0
        for (const entry of plan || []) {
          const row = list.find((r) => r.pluginId === entry.pluginId)
          if (!row) { missing += 1; continue }
          ran += 1
          jobs.push(runner.startUserRun({
            agentId: row.agentId,
            pluginId: entry.pluginId,
            packageId: entry.packageId,
            mode: 'run',
            hasClientHalf: entry.hasClientHalf,
          }).catch((err) => setError('运行 ' + entry.pluginId + ' 失败：' + errText(err))))
        }
        if (ran > 0) setMsg('已发起运行 ' + ran + ' 个插件' + (missing ? '（' + missing + ' 个清单未刷新，稍后重试）' : '') + '…')
        else if (missing > 0) setMsg('插件清单尚未刷新，请稍候再点「运行已启用」')
      }, [runner, rows])

      const refresh = React.useCallback(() => {
        if (!cordis) {
          setError('无法访问 DSH 插件服务（remote.dynamicCordisRunner 不可用）')
          return
        }
        const inv = cordis.inventory()
          .then((answered) => {
            if (!answered || !answered.ok) {
              const e = answered && answered.error
              throw new Error(e ? e.code + ': ' + e.message : '读取失败')
            }
            return answered.value || []
          })
        const meta = host.call('bm:list')
          .then((res) => (res && res.ok ? res : { ok: false, rows: [], error: res && res.error, autoRestored: false, runPlan: [], store: null }))
          .catch(() => ({ ok: false, rows: [], autoRestored: false, runPlan: [], store: null }))
        Promise.all([inv, meta]).then(([rowsNow, meta]) => {
          setRows(rowsNow)
          setStore(meta.store || null)
          setError(meta.error || null)
          if (meta.autoRestored && meta.runPlan && meta.runPlan.length && !didAutoRun.current) {
            didAutoRun.current = true
            setMsg('已从快照自动恢复插件定义，正在运行 ' + meta.runPlan.length + ' 个已启用的插件…')
            runEnabled(meta.runPlan, rowsNow)
            host.call('bm:consumeAutoRestore', null).catch(() => {})
          }
        }).catch((err) => setError('读取插件清单失败：' + errText(err)))
      }, [runEnabled])

      React.useEffect(() => {
        refresh()
        return ctx.interval(refresh, 5000)
      }, [refresh])

      const act = React.useCallback((pluginId, op) => {
        setBusyId(pluginId)
        op()
          .then(() => { setBusyId(null); refresh() })
          .catch((err) => { setBusyId(null); setError(errText(err)); refresh() })
      }, [refresh])

      const saveSnapshot = React.useCallback(() => {
        setBusyId('*')
        host.call('bm:save', { force: true })
          .then((res) => {
            setBusyId(null)
            if (res && res.ok) setMsg('快照已保存：' + res.count + ' 个插件' + (res.savedAt ? ' · ' + fmtTime(res.savedAt) : ''))
            else setError((res && res.error) || '保存快照失败')
            refresh()
          })
          .catch((err) => { setBusyId(null); setError('保存快照失败：' + errText(err)) })
      }, [refresh])

      const restoreSnapshot = React.useCallback(() => {
        setBusyId('*')
        host.call('bm:restore')
          .then((res) => {
            setBusyId(null)
            if (res && res.ok) {
              if (res.restored > 0) {
                setMsg('已从快照恢复 ' + res.restored + ' 个插件定义' + (res.runPlan && res.runPlan.length ? '，其中 ' + res.runPlan.length + ' 个已启用' : ''))
                setPendingRun(res.runPlan || [])
              } else {
                setMsg('没有需要恢复的插件（均已存在或快照为空）')
                setPendingRun([])
              }
              refresh()
            } else {
              setError((res && res.error) || '恢复失败')
            }
          })
          .catch((err) => { setBusyId(null); setError('恢复失败：' + errText(err)) })
      }, [refresh])

      const run = React.useCallback((row) => {
        const pkgId = row.currentPackageId || (row.packages && row.packages.length ? row.packages[row.packages.length - 1].packageId : null)
        if (!pkgId) { setError('该插件没有可运行的 Package'); return }
        const pkg = (row.packages || []).find((p) => p.packageId === pkgId)
        if (!runner) { setError('无法启动：dynamicCordisRunner（运行编排器）不可用'); return }
        act(row.pluginId, () => runner.startUserRun({
          agentId: row.agentId,
          pluginId: row.pluginId,
          packageId: pkgId,
          mode: 'run',
          hasClientHalf: !!(pkg && pkg.hasClientHalf),
        }))
      }, [act])

      const stop = React.useCallback((row) => {
        if (!cordis) return
        act(row.pluginId, () => cordis.stopFromPanel(row.agentId, row.pluginId)
          .then((answered) => {
            if (!answered || !answered.ok) {
              const e = answered && answered.error
              throw new Error(e ? e.code + ': ' + e.message : '停止失败')
            }
            const v = answered.value || {}
            if (!v.ok && v.reason !== 'not-running') throw new Error(v.message || '停止失败')
          }))
      }, [act])

      const remove = React.useCallback((row) => {
        if (!cordis) return
        act(row.pluginId, () => cordis.undefineFromPanel(row.agentId, row.pluginId)
          .then((answered) => {
            if (!answered || !answered.ok) {
              const e = answered && answered.error
              throw new Error(e ? e.code + ': ' + e.message : '删除失败')
            }
            const v = answered.value || {}
            if (!v.ok) throw new Error(v.message || '删除失败')
            setConfirmRemove(null)
          }))
      }, [act])

      const toggle = React.useCallback((row) => {
        const st = statusOf(row)
        if (st.key === 'running') stop(row)
        else run(row)
      }, [stop, run])

      const flipFooter = React.useCallback(() => {
        const next = !hideFooter
        setHideFooter(next)
        setFooterHidden(next)
      }, [hideFooter])

      const flipSettings = React.useCallback(() => {
        const next = !hideSettings
        setHideSettings(next)
        setSettingsHidden(next)
      }, [hideSettings])

      const list = rows || []
      const busy = busyId !== null

      const cards = list.map((row) => {
        const st = statusOf(row)
        const pkg = row.packages && row.packages.length
          ? row.packages.find((p) => p.packageId === (row.currentPackageId || row.packages[row.packages.length - 1].packageId))
          : undefined
        const name = (pkg && pkg.name) || row.pluginId
        const purpose = (pkg && pkg.purpose) || ''
        const mine = current !== undefined && row.agentId === current

        const badges = [
          React.createElement('span', { key: 'st', className: 'bm-badge ' + (st.cls ? 'bm-' + st.cls : '') }, st.label),
          mine
            ? React.createElement('span', { key: 'me', className: 'bm-badge' }, '本会话')
            : current !== undefined
              ? React.createElement('span', { key: 'me', className: 'bm-badge bm-warn' }, '其他会话')
              : null,
          (pkg && pkg.hasClientHalf) ? React.createElement('span', { key: 'c', className: 'bm-badge bm-ok' }, 'Client') : null,
          confirmRemove === row.pluginId ? React.createElement('span', { key: 'x', className: 'bm-badge bm-err' }, '确认删除？') : null,
        ]

        const foot = confirmRemove === row.pluginId
          ? React.createElement('div', { className: 'bm-confirm' },
              React.createElement('button', { className: 'bm-btn bm-btn-danger', disabled: busy, onClick: () => remove(row) }, '确认删除'),
              React.createElement('button', { className: 'bm-btn', disabled: busy, onClick: () => setConfirmRemove(null) }, '取消'),
            )
          : React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'bm-actions' },
                React.createElement('button', {
                  className: 'bm-btn bm-btn-danger',
                  disabled: busy,
                  onClick: () => setConfirmRemove(row.pluginId),
                  title: '从 DSH 插件目录中删除该插件',
                }, '删除'),
                React.createElement('button', {
                  className: 'bm-switch' + (st.key === 'running' ? ' bm-on' : ''),
                  disabled: busy || st.key === 'approval',
                  role: 'switch',
                  'aria-checked': st.key === 'running',
                  'aria-label': (st.key === 'running' ? '停止 ' : '运行 ') + name,
                  title: st.key === 'running' ? '点击停止' : st.key === 'approval' ? '等待批准中' : '点击运行',
                  onClick: () => toggle(row),
                }),
              ),
            )

        return React.createElement('div', { key: row.pluginId, className: 'bm-card' },
          React.createElement('div', { className: 'bm-card-head' },
            React.createElement('div', { className: 'bm-card-main' },
              React.createElement('div', { className: 'bm-name' }, name),
              React.createElement('div', { className: 'bm-id' }, row.pluginId),
            ),
            React.createElement('div', { className: 'bm-badges' }, badges),
          ),
          React.createElement('div', { className: 'bm-purpose' }, purpose || '（无描述）'),
          React.createElement('div', { className: 'bm-version' },
            'Package: ' + (pkg ? pkg.packageId : '-') +
            (row.packages && row.packages.length > 1 ? '（共 ' + row.packages.length + ' 个版本）' : ''),
          ),
          React.createElement('div', { className: 'bm-card-foot' }, foot),
        )
      })

      return React.createElement('div', { className: 'bm-page' },
        React.createElement('div', { className: 'bm-head' },
          React.createElement('div', null,
            React.createElement('div', { className: 'bm-title' }, 'Better Manager'),
            React.createElement('div', { className: 'bm-sub' }, 'DSH 动态插件目录 · 已注册 ' + list.length + ' 个插件'),
          ),
          React.createElement('div', { className: 'bm-tools' },
            React.createElement('button', { className: 'bm-btn', disabled: busy, onClick: refresh }, '刷新'),
            React.createElement('button', {
              className: 'bm-btn',
              disabled: busy,
              onClick: saveSnapshot,
              title: '把当前全部插件（含源码与启用状态）写入持久化快照',
            }, '保存快照'),
            React.createElement('button', {
              className: 'bm-btn',
              disabled: busy,
              onClick: restoreSnapshot,
              title: '从快照恢复缺失的插件定义（保留原 pluginId）',
            }, '从快照恢复'),
            React.createElement('label', { className: 'bm-toggle' },
              React.createElement('button', {
                className: 'bm-switch' + (hideFooter ? ' bm-on' : ''),
                role: 'switch',
                'aria-checked': hideFooter,
                onClick: flipFooter,
              }),
              '隐藏左下角入口',
            ),
            React.createElement('label', { className: 'bm-toggle' },
              React.createElement('button', {
                className: 'bm-switch' + (hideSettings ? ' bm-on' : ''),
                role: 'switch',
                'aria-checked': hideSettings,
                onClick: flipSettings,
              }),
              '隐藏设置插件分区',
            ),
          ),
        ),

        store
          ? React.createElement('div', { className: 'bm-store' },
              '持久化快照：' + store.count + ' 个插件' +
              (store.savedAt ? ' · 上次保存 ' + fmtTime(store.savedAt) : '') +
              '（.better-manager-plugins.json）',
              pendingRun.length > 0
                ? React.createElement('button', {
                    className: 'bm-btn bm-btn-primary',
                    disabled: busy,
                    onClick: () => runEnabled(pendingRun, rows),
                  }, '运行已启用的 ' + pendingRun.length + ' 个插件')
                : null,
            )
          : null,

        msg ? React.createElement('div', { className: 'bm-msg' }, msg) : null,

        error ? React.createElement('div', { className: 'bm-error' }, error) : null,

        rows === null
          ? React.createElement('div', { className: 'bm-loading' }, '加载中…')
          : list.length === 0
            ? React.createElement('div', { className: 'bm-empty' },
                'DSH 动态插件目录中暂无插件。\n通过 cordis_define 定义并 cordis_run 运行后，插件会出现在这里。',
              )
            : React.createElement('div', { className: 'bm-grid' }, cards),

        React.createElement('div', { className: 'bm-foot' },
          '数据源 = DSH 动态插件注册表（dynamicCordisRunner），与内置左下角 Cordis 面板同源；',
          '开关 = 运行 / 停止（startUserRun / stopFromPanel）；删除 = undefineFromPanel（不可恢复）。',
          '持久化 = 快照保存到工作区根目录 .better-manager-plugins.json（含全部插件源码），启动时自动补回快照中缺失的插件定义，防止插件丢失。',
          '「隐藏左下角入口」默认开启（刷新页面后恢复默认）：以更低优先级覆盖内置入口，关闭开关即可恢复内置面板。',
        ),
      )
    }

    // ---------- 注册设置侧边栏入口（自定义方块图标） ----------
    slots.inject('settings.section', () => slots.register(
      {
        name: 'settings.section',
        id: 'better-manager',
        order: 40,
        label: () => React.createElement('span', { className: 'bm-nav-label' },
          React.createElement(BlocksIcon),
          'Better Manager',
        ),
      },
      (props) => React.createElement(BetterManagerPage, { useSessions: props && props.useSessions }),
    ))
  },
}
