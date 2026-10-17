import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const result = await build({ stdin: { contents: `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  let plugin;
  window.__ModuleLoader__ = { load({factory}) { plugin = factory(name => { if (name === 'react') return React; throw Error(name); }); } };
  ${bundle}
  const target = createRoot(document.getElementById('appearance'));
  const events = new Set(), locales = new Set();
  let preference = 'system', language = 'zh';
  const media = matchMedia('(prefers-color-scheme: dark)');
  function present() {
    document.body.dataset.dark = String(preference === 'dark' || (preference === 'system' && media.matches));
  }
  media.addEventListener('change', present);
  present();
  plugin.apply({ effect: fn => fn(), on: (_event, fn) => { events.add(fn); return () => events.delete(fn); },
    theme: { getTheme: () => ({preference}), setTheme(mode) { preference = mode; present(); events.forEach(fn => fn()); } },
    locale: { getSnapshot: () => ({ active: language }), subscribe(fn) { locales.add(fn); return () => locales.delete(fn); } },
    slots: { inject: (_name, fn) => fn(), register: (_options, Comp) => { target.render(React.createElement(Comp)); return () => target.render(null); } },
  });
  document.getElementById('language').onchange = event => { language = event.target.value; document.documentElement.lang = language; locales.forEach(fn => fn()); };
`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022' })
const script = result.outputFiles[0].text
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH 通用设置 · MoonSeek 集成预览</title><style>
body { --dsw-alias-bg-base:#fff; --dsw-alias-label-primary:#262626; --dsw-alias-border-l2:#e5e5e5; --dsw-alias-border-l4:#d4d4d4; --dsw-radius-xl:16px; --dsw-alias-interactive-bg-hover:#f5f5f5; --dsw-alias-bg-module-platform:#f5f6f7; --dsw-static-neutral-bluish-400:#adb2b8; --dsw-alias-brand-primary:#4d6bfe; margin:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:14px/1.6 system-ui, sans-serif; }
body[data-dark=true] { --dsw-alias-bg-base:#292a2b; --dsw-alias-label-primary:#f1f1f1; --dsw-alias-border-l2:#393a3b; --dsw-alias-border-l4:#505153; --dsw-alias-interactive-bg-hover:#303132; --dsw-alias-bg-module-platform:#333536; }
* { box-sizing:border-box; }
body { min-height:100vh; overflow:hidden; color-scheme:light; background:color-mix(in srgb, var(--dsw-alias-bg-base), #000 24%); }
body[data-dark=true] { color-scheme:dark; }
main { display:flex; width:1000px; max-width:calc(100vw - 48px); height:min(800px, calc(100vh - 48px)); margin:24px auto; background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l2); border-radius:24px; overflow:hidden; }
nav { width:210px; flex:none; padding:24px 12px; }
h1 { font-size:18px; font-weight:500; margin:0 12px 24px; }
.nav-item { display:block; border-radius:12px; padding:12px; margin:4px 0; }
.nav-item[aria-current=true] { background:var(--dsw-alias-bg-module-platform); }
.content { flex:1; min-width:0; display:flex; flex-direction:column; }
header { display:flex; justify-content:flex-end; padding:20px 24px 0; }
.document-action { border:1px solid var(--dsw-alias-border-l4); border-radius:8px; padding:6px 12px; }
.general { padding:0 24px 24px; overflow:auto; }
.setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 0; border-bottom:.5px solid var(--dsw-alias-border-l2); }
.setting-name { margin:0; font-size:14px; font-weight:400; }
.setting-description { margin:4px 0 0; opacity:.65; }
select, input, .setting-value { font:inherit; color:inherit; background:var(--dsw-alias-bg-module-platform); border:0; border-radius:12px; padding:10px 16px; }
input { width:72px; text-align:center; }
@media(max-width:640px) { main { max-width:calc(100vw - 24px); margin:12px; height:calc(100vh - 24px); } nav { width:116px; padding:20px 8px; } h1 { margin-left:8px; } .nav-item { padding:10px 8px; } header { padding:16px 12px 0; } .general { padding:0 12px 16px; } .setting-row { flex-wrap:wrap; } }
</style><main role="dialog" aria-modal="true" aria-labelledby="settings-title">
<nav aria-label="设置分类"><h1 id="settings-title">设置</h1>
<span class="nav-item">账号与余额</span><span class="nav-item" aria-current="true">通用设置</span>
<span class="nav-item">模型</span><span class="nav-item">内置插件</span><span class="nav-item">Agent 预设</span></nav>
<div class="content"><header><span class="document-action">打开配置文件</span></header><div class="general">
<div class="setting-row"><div><h2 class="setting-name">权限</h2><p class="setting-description">选择新会话的默认权限模式</p></div><span class="setting-value">工作区内修改</span></div>
<div class="setting-row"><label for="language">语言</label><select id="language"><option value="zh">中文</option><option value="en">English</option></select></div>
<div id="appearance" data-slot="settings.general.item"></div>
<div class="setting-row"><div><h2 class="setting-name">字号大小</h2><p class="setting-description">仅影响会话内容的字号</p></div><span class="setting-value">14 px</span></div>
<div class="setting-row"><span>工作步骤展示</span><span class="setting-value">标准</span></div>
<div class="setting-row"><div><h2 class="setting-name">显示代码工作视图</h2><p class="setting-description">开启后，显示轨迹、本轮代码差异</p></div><span class="setting-value">开启</span></div>
<div class="setting-row"><div><h2 class="setting-name">快捷键</h2><p class="setting-description">查看和编辑当前可用的快捷键和输入操作</p></div><span class="setting-value">编辑快捷键</span></div>
<div class="setting-row"><span>网页链接默认打开方式</span><span class="setting-value">应用内侧边栏</span></div>
</div></div></main><script src="/preview.js"></script></html>`
const server = createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/preview.js') { res.writeHead(404); res.end(); return }
  res.setHeader('Content-Type', req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8')
  res.end(req.url === '/' ? html : script)
})
server.listen(4178, '127.0.0.1', () => console.log('MoonSeek UI preview: http://127.0.0.1:4178'))
