import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GitLauncher } from '../src/launcher.tsx'
import { GitPanel } from '../src/panel.tsx'
import { GitNotifications } from '../src/notifications.tsx'
import css from '../src/panel.css'
import type { GitRemote, GitState } from '../src/contracts.ts'
const state: GitState = {
  root: 'C:/Projects/openwallet', name: 'openwallet', branch: 'codex/android-demo', upstream: 'origin/codex/android-demo',
  ahead: 2, behind: 0, additions: 2256, deletions: 152, protected: false, writable: true,
  files: [ { path: 'app/Navigation.kt', index: 'M', worktree: ' ' }, { path: 'app/SettingsScreen.kt', index: ' ', worktree: 'M' },
    { path: 'app/Theme.kt', index: ' ', worktree: 'M' }, { path: 'docs/使用说明.md', index: '?', worktree: '?' } ],
}
const remote: GitRemote = { async run(request) {
  if (request.action === 'state') return { ok: true, value: { state: structuredClone(state) } }
  if (request.action === 'branches') return { ok: true, value: { branches: ['main', 'codex/android-demo'] } }
  if (request.action === 'prInfo') return { ok: true, value: { pr: null, base: 'main' } }
  if (request.action === 'diff') return { ok: true, value: { text: `diff --git a/${request.path} b/${request.path}\n--- a/${request.path}\n+++ b/${request.path}\n@@ -12,4 +12,7 @@\n fun ${request.path?.split('/').pop()?.replace(/\.[^.]+$/, '')}() {\n-    DefaultNavigation()\n+    FloatingNavigationBar(\n+        selectedTab = currentTab,\n+        onSelect = ::navigate\n+    )\n }` } }
  await new Promise(resolve => setTimeout(resolve, 1800))
  return { ok: true, value: { state: structuredClone(state), notice: '开发预览：未执行实际 Git 操作' } }
} }
function Preview() {
  const [theme, setTheme] = useState('dark')
  const [tab, setTab] = useState<'start' | 'dshgit' | null>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => { document.documentElement.style.colorScheme = theme }, [theme])
  return <div style={{ colorScheme: theme }}><style>{css}</style><style>{`
    * { box-sizing: border-box; } body { margin:0; font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif; }
    .preview { height:100dvh; display:flex; background:light-dark(#fff,#141416); color:light-dark(#222,#eee); }
    .preview-nav { width:240px; flex-shrink:0; padding:28px 18px; background:light-dark(#f5f5f5,#1c1c1e); }
    .preview-nav strong { font-size:22px; } .preview-nav p { margin-top:36px; color:light-dark(#777,#aaa); } .preview-nav div { padding:12px; border-radius:10px; background:light-dark(#e8e8e8,#303033); font-size:14px; }
    .preview-shell { position:relative; display:flex; flex-direction:column; flex:1; min-width:0; }
    .preview-toolbar { min-height:76px; display:flex; align-items:center; justify-content:space-between; padding:18px 24px; border-bottom:1px solid light-dark(#ddd,#333); font-size:14px; gap:12px; }
    .preview-toolbar>div { display:flex; gap:12px; align-items:center; }
    .preview-toolbar button { padding:8px 14px; border-radius:8px; border:1px solid light-dark(#ccc,#444); background:transparent; color:inherit; cursor:pointer; }
    .preview-content { flex:1; min-height:0; display:flex; flex-direction:column; }
    .preview-messages { flex:1; overflow:auto; padding:36px 30px; }
    .preview-copy { max-width:760px; margin:auto; line-height:1.9; font-size:15px; }
    .preview-user { margin-left:auto; width:fit-content; padding:10px 18px; border-radius:20px; background:light-dark(#ededee,#2c2c2f); }
    .preview-copy h2 { margin-top:48px; font-size:22px; }
    .preview-copy ul { padding-left:22px; } .preview-copy li { margin:12px 0; }
    .preview-composer { margin:20px auto 28px; width:calc(100% - 48px); max-width:760px; padding:18px; border-radius:24px; background:light-dark(#f1f1f2,#2c2c2f); }
    .preview-composer textarea { width:100%; min-height:60px; resize:none; border:0; outline:none; color:inherit; background:none; font:inherit; }
    .preview-composer div { display:flex; justify-content:space-between; color:light-dark(#777,#aaa); font-size:13px; }
    .preview-right { width:600px; flex-shrink:0; min-height:0; border-left:1px solid light-dark(#ddd,#333); display:flex; flex-direction:column; }
    .preview-right[data-narrow=true] { width:360px; }
    .preview-tabs { display:flex; align-items:center; gap:8px; padding:12px; border-bottom:1px solid light-dark(#ddd,#333); }
    .preview-tabs button,.preview-start button { border:1px solid light-dark(#ddd,#444); border-radius:10px; background:light-dark(#f5f5f5,#252525); color:inherit; padding:10px 14px; cursor:pointer; font:inherit; }
    .preview-tabs button[aria-selected=true] { background:light-dark(#ddd,#404040); }
    .preview-start { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:stretch; gap:16px; padding:40px; }
    .preview-start button { padding:20px; text-align:left; }
    .preview-tab-body { flex:1; min-height:0; }
    @media(max-width:1000px) { .preview-right { width:52vw; } .preview-nav { display:none; } }
    @media(max-width:1000px) { .preview-nav { width:180px; } }
    @media(max-width:700px) { .preview-nav { display:none; } .preview-toolbar { padding:12px; } .preview-toolbar>span { font-size:12px; } .preview-toolbar button { padding:6px; } .preview-messages { padding:24px; } }
  `}</style><main className="preview"><nav className="preview-nav"><strong>deepseek <small>HARNESS</small></strong><p>工作区</p><div>openwallet</div></nav><div className="preview-shell" data-phase="active"><header className="preview-toolbar"><span>DSHGit · 布局预览（演示数据）</span><div><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>切换{theme === 'dark' ? '亮色' : '暗色'}</button><button onClick={() => setTab(tab ? null : 'start')}>侧边栏</button><GitLauncher sessionId="preview" remote={remote} onOpen={() => setTab('dshgit')}/></div></header><div className="preview-content" data-conversation-content=""><div className="preview-messages"><article className="preview-copy"><p className="preview-user">帮我看一下这个工作区的修改</p><h2>工作区变更</h2><p>右侧卡片集中显示当前仓库和变更。卡片保持原位，点击变更在原生右侧栏中查看代码。</p><ul><li>点击「变更」查看文件列表和差异。</li><li>选择提交或推送后菜单立即关闭，完成后顶部通知。</li><li>通过标题栏 DSHGit 按钮收起或展开卡片。</li></ul></article></div><div className="preview-composer" data-composer-seat=""><textarea aria-label="预览消息输入框" placeholder="发送消息或创建任务…"/><div><span>＋　完全权限</span><span>DeepSeek　↑</span></div></div></div></div>{tab && <aside className="preview-right" data-narrow={narrow} aria-label="原生侧边栏布局预览"><div className="preview-tabs"><button role="tab" aria-selected={tab === 'start'} onClick={() => setTab('start')}>开始</button><button role="tab" aria-selected={tab === 'dshgit'} onClick={() => setTab('dshgit')}>变更</button><button onClick={() => setNarrow(!narrow)}>{narrow ? '加宽' : '收窄'}</button><button aria-label="关闭侧边栏" onClick={() => setTab(null)}>×</button></div>{tab === 'start' ? <div className="preview-start"><button disabled>📁 工作区文件</button><button disabled>⌘ 新建终端</button><button disabled>◎ 浏览器</button><button onClick={() => setTab('dshgit')}>⑂ DSHGit</button><button disabled>更多工具</button></div> : <div className="preview-tab-body"><div className="dg-docked"><GitPanel sessionId="preview" remote={remote} onClose={() => setTab('start')}/></div></div>}</aside>}</main><GitNotifications/></div>
}
createRoot(document.getElementById('root')!).render(<Preview/> )
