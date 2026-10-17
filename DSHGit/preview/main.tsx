import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GitLauncher } from '../src/launcher.tsx'
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
  if (request.action === 'diff') return { ok: true, value: { text: `diff --git a/${request.path} b/${request.path}\n--- a/${request.path}\n+++ b/${request.path}\n@@ -12,4 +12,7 @@\n fun SettingsScreen() {\n-    DefaultNavigation()\n+    FloatingNavigationBar(\n+        selectedTab = currentTab,\n+        onSelect = ::navigate\n+    )\n }` } }
  return { ok: true, value: { state: structuredClone(state), notice: '开发预览：未执行实际 Git 操作' } }
} }
function Preview() {
  const [theme, setTheme] = useState('dark')
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
    @media(max-width:1000px) { .preview-nav { width:180px; } }
    @media(max-width:700px) { .preview-nav { display:none; } .preview-toolbar { padding:12px; } .preview-toolbar>span { font-size:12px; } .preview-toolbar button { padding:6px; } .preview-messages { padding:24px; } }
  `}</style><main className="preview"><nav className="preview-nav"><strong>deepseek <small>HARNESS</small></strong><p>工作区</p><div>openwallet</div></nav><div className="preview-shell" data-phase="active"><header className="preview-toolbar"><span>DSHGit · 布局预览（演示数据）</span><div><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>切换{theme === 'dark' ? '亮色' : '暗色'}</button><GitLauncher sessionId="preview" remote={remote}/></div></header><div className="preview-content" data-conversation-content=""><div className="preview-messages"><article className="preview-copy"><p className="preview-user">帮我看一下这个工作区的修改</p><h2>工作区变更</h2><p>右侧卡片集中显示当前仓库和变更。对话与输入框一起为卡片留出空间，可以边讨论边查看代码。</p><ul><li>点击「变更」查看文件列表和差异。</li><li>点击「查看全部」打开提交、推送和 Pull Request 面板。</li><li>通过标题栏 DSHGit 按钮收起或展开卡片。</li></ul></article></div><div className="preview-composer" data-composer-seat=""><textarea aria-label="预览消息输入框" placeholder="发送消息或创建任务…"/><div><span>＋　完全权限</span><span>DeepSeek　↑</span></div></div></div></div></main></div>
}
createRoot(document.getElementById('root')!).render(<Preview/> )
