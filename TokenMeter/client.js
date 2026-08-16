// ============================================================================
// Token Meter 计量插件 — Client 半区源码
// 插件 ID: tkmtr-2   Package: pkg-14
// 说明: 这是 cordis_define 的 code.client 函数体。把它作为 code.client 传入即可。
// 功能: 在设置侧边栏注册「Token 计量」页面（自定义柱状图图标），
//       展示累计/今日/单轮峰值/最长任务四个指标（输入含缓存命中）+ 近 52 周
//       GitHub 风格热力图，打开页面每 3 秒轮询刷新，默认滚到最右侧看最新记录。
//       统计卡支持 M（K/M/B）与 万/亿 两种计量单位，页面右上角小按键即时切换，
//       localStorage 记忆上次选择。
// ============================================================================
return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    // ---------- 包内样式 ----------
    styles.insert(`
.tm-page{display:flex;flex-direction:column;gap:16px;padding:4px 2px 24px;width:100%;box-sizing:border-box}
.tm-page-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.tm-page-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}
.tm-btn{padding:4px 12px;font-size:12px;line-height:20px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-family:inherit}
.tm-btn:hover{border-color:var(--dsw-alias-brand-primary)}
.tm-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.tm-reset{display:flex;align-items:center;gap:8px}
.tm-reset-ask{font-size:12px;color:var(--dsw-alias-state-warn-primary)}
.tm-head-right{display:flex;align-items:center;gap:8px}
.tm-unit{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;overflow:hidden;flex:none}
.tm-unit button{padding:2px 10px;font-size:12px;line-height:20px;border:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit}
.tm-unit button:hover{color:var(--dsw-alias-label-primary)}
.tm-unit button.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}
.tm-loading{color:var(--dsw-alias-label-secondary);font-size:13px;padding:24px 0;text-align:center}
.tm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.tm-stat{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.tm-stat-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.tm-stat-value{font-size:20px;font-weight:700;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.tm-stat-sub{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-heat{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;overflow-x:auto;box-sizing:border-box}
.tm-heat-title{font-size:12px;color:var(--dsw-alias-label-secondary)}
.tm-heat *{box-sizing:border-box}
.tm-heat-months{display:flex;gap:2px;padding-left:16px;height:14px}
.tm-heat-month{width:9px;height:14px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:visible;position:relative}
.tm-heat-body{display:flex;gap:4px}
.tm-heat-gutter{width:12px;display:grid;grid-template-rows:repeat(7,9px);gap:2px}
.tm-heat-weekday{font-size:9px;line-height:9px;color:var(--dsw-alias-label-secondary);align-self:center}
.tm-heat-cols{display:flex;gap:2px}
.tm-heat-col{display:grid;grid-template-rows:repeat(7,9px);gap:2px}
.tm-cell{width:9px;height:9px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.tm-cell:hover{border-color:var(--dsw-alias-label-secondary)}
.tm-l1{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 22%,var(--dsw-alias-bg-layer-1));border-color:transparent}
.tm-l2{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 42%,var(--dsw-alias-bg-layer-1));border-color:transparent}
.tm-l3{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 65%,var(--dsw-alias-bg-layer-1));border-color:transparent}
.tm-l4{background:var(--dsw-alias-state-success-primary);border-color:transparent}
.tm-heat-legend{display:flex;align-items:center;gap:3px;justify-content:flex-end;font-size:10px;color:var(--dsw-alias-label-secondary)}
/* 设置侧边栏导航：自定义图标替换默认齿轮 */
.tm-nav-label{display:inline-flex;align-items:center;gap:8px;min-width:0}
.tm-nav-label svg{flex:none}
button:has(.tm-nav-label)>svg{display:none}
`)

    // ---------- 设置侧边栏专用图标（柱状图） ----------
    function MeterIcon() {
      return React.createElement('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
        React.createElement('rect', { x: 2, y: 8, width: 3, height: 6, rx: 1, fill: 'currentColor' }),
        React.createElement('rect', { x: 6.5, y: 4, width: 3, height: 10, rx: 1, fill: 'currentColor' }),
        React.createElement('rect', { x: 11, y: 1, width: 3, height: 13, rx: 1, fill: 'currentColor' }),
      )
    }

    // ---------- 工具函数 ----------
    function dateKeyOf(d) {
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return d.getFullYear() + '-' + m + '-' + day
    }

    // 计量单位一：M（K / M / B，国际惯例，31.1M）
    function fmtNumM(n) {
      if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'
      if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    // 计量单位二：中文（万 / 亿）
    function fmtNumCN(n) {
      if (n >= 100000000) return (n / 100000000).toFixed(2) + ' 亿'
      if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    function fmtDur(ms) {
      if (!ms) return '—'
      const s = Math.floor(ms / 1000)
      if (s < 60) return s + ' 秒'
      const m = Math.floor(s / 60)
      if (m < 60) return m + ' 分 ' + (s % 60) + ' 秒'
      const h = Math.floor(m / 60)
      return h + ' 小时 ' + (m % 60) + ' 分'
    }

    // ---------- 热力图：近 52 周，按周分列（周日起），最新在右侧 ----------
    function buildWeeks(daily) {
      const today = new Date()
      const lastDay = new Date(today)
      lastDay.setDate(today.getDate() + (6 - today.getDay()))
      const start = new Date(lastDay)
      start.setDate(lastDay.getDate() - (52 * 7 - 1))
      const weeks = []
      for (let w = 0; w < 52; w++) {
        const col = []
        for (let d = 0; d < 7; d++) {
          const day = new Date(start)
          day.setDate(start.getDate() + w * 7 + d)
          const key = dateKeyOf(day)
          const v = daily ? daily[key] : null
          col.push({ key, date: day, total: v ? (Number(v.input) || 0) + (Number(v.output) || 0) : 0 })
        }
        weeks.push(col)
      }
      return weeks
    }

    function levelOf(total, max) {
      if (!total) return 0
      if (max <= 0) return 1
      const r = Math.sqrt(total / max)
      if (r >= 0.75) return 4
      if (r >= 0.5) return 3
      if (r >= 0.25) return 2
      return 1
    }

    // ---------- 组件 ----------
    function StatCard(props) {
      return React.createElement('div', { className: 'tm-stat' },
        React.createElement('div', { className: 'tm-stat-label' }, props.label),
        React.createElement('div', { className: 'tm-stat-value' }, props.value),
        props.sub ? React.createElement('div', { className: 'tm-stat-sub' }, props.sub) : null,
      )
    }

    function Heatmap(props) {
      const daily = props.daily || {}
      const scrollRef = React.useRef(null)
      const didInit = React.useRef(false)
      // 默认滚到最右侧，直接看到最新记录（仅首次，避免刷新时抢走手动滚动位置）
      React.useEffect(() => {
        if (didInit.current) return
        didInit.current = true
        const el = scrollRef.current
        if (el) el.scrollLeft = el.scrollWidth
      }, [])

      const weeks = React.useMemo(() => buildWeeks(daily), [daily])
      const max = React.useMemo(() => {
        let m = 0
        for (const col of weeks) for (const c of col) if (c.total > m) m = c.total
        return m
      }, [weeks])
      const monthLabels = React.useMemo(() => {
        const out = []
        weeks.forEach((col, i) => {
          const hit = col.find((c) => c.date.getDate() === 1)
          if (hit) out.push({ index: i, label: (hit.date.getMonth() + 1) + '月' })
        })
        return out
      }, [weeks])

      const monthRow = React.createElement('div', { className: 'tm-heat-months' },
        weeks.map((col, i) => {
          const ml = monthLabels.find((x) => x.index === i)
          return React.createElement('div', { key: i, className: 'tm-heat-month' + (ml ? ' has' : '') }, ml ? ml.label : '')
        }),
      )

      const body = React.createElement('div', { className: 'tm-heat-body' },
        React.createElement('div', { className: 'tm-heat-gutter' },
          [1, 3, 5].map((r) =>
            React.createElement('div', { key: r, className: 'tm-heat-weekday', style: { gridRow: r + 1 } },
              ['', '一', '', '三', '', '五', ''][r],
            )),
        ),
        React.createElement('div', { className: 'tm-heat-cols' },
          weeks.map((col, w) =>
            React.createElement('div', { key: w, className: 'tm-heat-col' },
              col.map((c) => {
                const lv = levelOf(c.total, max)
                const title = c.key + ' · ' + c.total.toLocaleString() + ' tokens'
                return React.createElement('div', {
                  key: c.key,
                  className: 'tm-cell' + (lv ? ' tm-l' + lv : ''),
                  title,
                })
              }),
            )),
        ),
      )

      const legend = React.createElement('div', { className: 'tm-heat-legend' },
        React.createElement('span', null, '少'),
        [0, 1, 2, 3, 4].map((l) => React.createElement('div', { key: l, className: 'tm-cell' + (l ? ' tm-l' + l : '') })),
        React.createElement('span', null, '多'),
      )

      return React.createElement('div', { className: 'tm-heat', ref: scrollRef },
        React.createElement('div', { className: 'tm-heat-title' }, '每日 Token 用量（近 52 周）'),
        monthRow,
        body,
        legend,
      )
    }

    function TokenMeterPage() {
      const [data, setData] = React.useState(null)
      const [confirming, setConfirming] = React.useState(false)
      // 计量单位：'M' = K/M/B，'CN' = 万/亿；localStorage 记忆上次选择
      const [unitMode, setUnitMode] = React.useState(() => {
        try { return localStorage.getItem('tkmtr:unit') === 'CN' ? 'CN' : 'M' } catch (err) { return 'M' }
      })
      const fmt = unitMode === 'M' ? fmtNumM : fmtNumCN
      const switchUnit = React.useCallback((m) => {
        setUnitMode(m)
        try { localStorage.setItem('tkmtr:unit', m) } catch (err) { /* ignore */ }
      }, [])
      const load = React.useCallback(() => {
        host.call('meter:state')
          .then((res) => { if (res) setData(res) })
          .catch(() => {})
      }, [])
      React.useEffect(() => {
        load()
        return ctx.interval(load, 3000)
      }, [load])
      const reset = React.useCallback(() => {
        host.call('meter:reset')
          .then((res) => { if (res) setData(res); setConfirming(false) })
          .catch(() => { setConfirming(false) })
      }, [])

      const cum = data ? data.cumulative : null
      const today = data ? data.today : null

      return React.createElement('div', { className: 'tm-page' },
        React.createElement('div', { className: 'tm-page-head' },
          React.createElement('div', { className: 'tm-page-title' }, 'Token 计量'),
          React.createElement('div', { className: 'tm-head-right' },
            React.createElement('div', { className: 'tm-unit' },
              React.createElement('button', {
                className: 'tm-unit-btn' + (unitMode === 'M' ? ' on' : ''),
                onClick: () => switchUnit('M'),
                title: 'M 单位（K/M/B，如 31.1M）',
              }, 'M'),
              React.createElement('button', {
                className: 'tm-unit-btn' + (unitMode === 'CN' ? ' on' : ''),
                onClick: () => switchUnit('CN'),
                title: '中文单位（万/亿，如 3110 万）',
              }, '万'),
            ),
            confirming
              ? React.createElement('div', { className: 'tm-reset' },
                  React.createElement('span', { className: 'tm-reset-ask' }, '确认清空全部数据？'),
                  React.createElement('button', { className: 'tm-btn tm-btn-danger', onClick: reset }, '确认'),
                  React.createElement('button', { className: 'tm-btn', onClick: () => setConfirming(false) }, '取消'),
                )
              : React.createElement('button', { className: 'tm-btn', onClick: () => setConfirming(true) }, '清空数据'),
          ),
        ),
        data === null
          ? React.createElement('div', { className: 'tm-loading' }, '加载中…')
          : React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'tm-stats' },
                React.createElement(StatCard, {
                  label: '累计 Token',
                  value: fmt(cum.total),
                  sub: '输入 ' + fmt(cum.input) + ' · 输出 ' + fmt(cum.output) + ' · 缓存 ' + fmt(cum.cacheRead),
                }),
                React.createElement(StatCard, {
                  label: '今日 Token',
                  value: fmt(today.total),
                  sub: '输入 ' + fmt(today.input) + ' · 输出 ' + fmt(today.output) + ' · 缓存 ' + fmt(today.cacheRead),
                }),
                React.createElement(StatCard, {
                  label: '单轮峰值 Token',
                  value: fmt(data.peakRoundTokens),
                  sub: data.peakRoundDate ? data.peakRoundDate + ' 达成' : '暂无记录',
                }),
                React.createElement(StatCard, {
                  label: '最长单次任务',
                  value: fmtDur(data.longestRoundMs),
                  sub: data.longestRoundDate ? data.longestRoundDate + ' 达成' : '暂无记录',
                }),
              ),
              React.createElement(Heatmap, { daily: data.daily }),
            ),
      )
    }

    // ---------- 注册设置侧边栏入口（自定义柱状图图标） ----------
    slots.inject('settings.section', () => slots.register(
      {
        name: 'settings.section',
        id: 'token-meter',
        order: 30,
        label: () => React.createElement('span', { className: 'tm-nav-label' },
          React.createElement(MeterIcon),
          'Token 计量',
        ),
      },
      () => React.createElement(TokenMeterPage),
    ))
  },
}
