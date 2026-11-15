import { useState } from 'react'
import type { GitRemote } from '../src/contracts.ts'
import { Icon } from '../src/panel.tsx'
import { PullPanel } from '../src/pull-panel.tsx'
import type { PullDetail, PullFile } from '../src/pulls.ts'
import styles from '../src/pull-panel.css'

const navigation: PullFile = {
  filename: 'app/Navigation.kt', additions: 3, deletions: 1,
  patch: '@@ -72,3 +72,5 @@\n fun navigate(tab: Tab) {\n-    stack.push(tab)\n+    if (stack.current != tab) {\n+        stack.push(tab)\n+    }\n }',
}
const testFile: PullFile = {
  filename: 'test/NavigationTest.kt', additions: 4, deletions: 0,
  patch: '@@ -18,0 +19,4 @@\n+@Test fun keepsCurrentTab() {\n+    navigate(Tab.Home)\n+    assertEquals(Tab.Home, stack.current)\n+}',
}
const primary: PullDetail = {
  number: 48, title: '统一底部导航，保留标签页浏览位置', url: 'https://github.com/demo/openwallet/pull/48',
  state: 'OPEN', isDraft: false, author: { login: 'Logan' }, updatedAt: '2026-11-15T03:10:00Z',
  headRefName: 'feat/navigation', baseRefName: 'main', additions: 7, deletions: 1, changedFiles: 2,
  body: '## 摘要\n\n首页、账本和设置共用同一个导航栈。再次点选当前标签时，保留页面的滚动位置和筛选条件。\n\n- 将标签切换收敛到 Navigation 入口。\n- 跳过重复入栈，让返回键回到上一个访问的标签。\n\n## 测试\n\n覆盖重复点选当前标签的导航用例。',
  comments: [{ author: { login: 'Mira' }, body: '重复点选标签后，账本筛选仍然保留。', createdAt: '2026-11-15T03:10:00Z' }],
  commits: [{ oid: 'c1a87bf023', messageHeadline: '保留当前标签的导航状态', committedDate: '2026-11-14T09:00:00Z' }],
  reviewRequests: [], latestReviews: [{ author: { login: 'Mira' }, state: 'APPROVED' }],
  statusCheckRollup: [{ name: 'Android / unit tests', conclusion: 'SUCCESS' }, { name: 'Kotlin / lint', conclusion: 'SUCCESS' }],
}
const samples = [
  { number: 46, title: '调整账本月份选择器', state: 'OPEN', who: 'Mira', day: 14, file: 'MonthPicker.kt', line: 'val initialMonth = selectedMonth' },
  { number: 45, title: '为导入记录添加来源字段', state: 'DRAFT', who: 'Logan', day: 13, file: 'ImportRow.kt', line: 'val source: String = "local"' },
  { number: 42, title: '更新交易分类的默认配色', state: 'MERGED', who: 'Noah', day: 11, file: 'Palette.kt', line: 'val expense = Color(0xFFB66060)' },
] as const
const pulls: PullDetail[] = [primary, ...samples.map(s => ({
  ...primary, number: s.number, title: s.title, url: primary.url.replace(/48$/, String(s.number)), state: s.state === 'DRAFT' ? 'OPEN' as const : s.state,
  isDraft: s.state === 'DRAFT', author: { login: s.who }, headRefName: 'feature/' + s.file.replace('.kt', '').toLowerCase(),
  updatedAt: `2026-11-${s.day}T08:00:00Z`, body: '## 摘要\n\n' + s.title + '。', additions: 1, deletions: 0, changedFiles: 1,
  comments: [], commits: [], latestReviews: [], statusCheckRollup: [], reviewRequests: [],
}))]
const remote: GitRemote = { async run(request) {
  const second = request.sessionId === 'wiesler'
  const list = second ? [{ ...primary, number: 48, title: '显示 DNS 连接状态', url: 'https://github.com/demo/wiesler/pull/48',
    updatedAt: '2026-11-13T03:10:00Z', headRefName: 'feat/dns-status', body: '## 摘要\n\n在连接详情中显示当前 DNS 状态。', changedFiles: 1, additions: 1, deletions: 0, comments: [], commits: [] }] : pulls
  if (request.action === 'pullList') return { ok: true, value: { repository: second ? 'demo/wiesler' : 'demo/openwallet', pulls: list } }
  if (request.action === 'pullDetail') return { ok: true, value: { pull: list.find(pr => pr.number === request.number)! } }
  if (second) return { ok: true, value: { pullFiles: [{ filename: 'ui/Connection.tsx', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+<DnsStatus />' }] } }
  const s = samples.find(p => p.number === request.number)
  return { ok: true, value: { pullFiles: s ? [{ filename: 'app/' + s.file, additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+' + s.line }] : [navigation, testFile] } }
} }
export function PullDemo({ back }: { back: () => void }) {
  const [light, setLight] = useState(false)
  return <div className="pr-demo" style={{ colorScheme: light ? 'light' : 'dark' }}><style>{styles}</style><style>{`
    .pr-demo { height:100dvh; display:grid; grid-template:50px minmax(0,1fr) / clamp(170px,16vw,230px) minmax(0,1fr); background:light-dark(#f7f7f8,#1c1c1e); color:light-dark(#28282a,#ededed); font:14px/1.5 "Segoe UI","Microsoft YaHei",sans-serif; }
    .pr-demo .dg-pr { --dg-bg:light-dark(#fff,#19191b); --dg-card:light-dark(#f3f3f5,#252527); --dg-hover:light-dark(#e7e7eb,#323235); --dg-line:light-dark(#e1e1e5,#333336); }
    .pr-demo-top { grid-column:2; display:flex; align-items:center; gap:14px; padding:0 18px; border-bottom:1px solid light-dark(#ddd,#333); }
    .pr-demo-top b { font-size:15px; letter-spacing:-.4px; } .pr-demo-top span { color:light-dark(#636365,#aaa); }
    .pr-demo-top small { margin-left:auto; color:light-dark(#666,#aaa); }
    .pr-demo button { font:inherit; }
    .pr-demo-top button,.pr-demo-rail button { color:inherit; background:none; border:0; cursor:pointer; }
    .pr-demo-top button { border:1px solid light-dark(#ddd,#393939); border-radius:8px; padding:4px 9px; }
    .pr-demo-rail { grid-area:1/1/3/2; display:flex; flex-direction:column; gap:4px; padding:17px 10px; border-right:1px solid light-dark(#ddd,#333); }
    .pr-demo-rail>b { padding:0 10px 18px; font-size:21px; } .pr-demo-rail>b small { font-size:10px; letter-spacing:1px; }
    .pr-demo-rail>span,.pr-demo-rail button { padding:8px 12px; display:flex; align-items:center; gap:9px; border-radius:9px; text-align:left; }
    .pr-demo-rail button:hover,.pr-demo-rail [aria-current=page] { background:light-dark(#e2e2e5,#363638); }
    .pr-demo-rail>small { padding:20px 12px 2px; opacity:.6; }
    @media(max-width:720px) { .pr-demo { grid-template-columns:minmax(0,1fr); } .pr-demo-rail { display:none; } .pr-demo-top { grid-column:1; } }
  `}</style><header className="pr-demo-top"><b>DSHGit</b><span>/</span><span>拉取请求</span><small>演示数据</small><button onClick={() => setLight(!light)}>{light ? '暗色' : '亮色'}</button></header>
    <nav className="pr-demo-rail" aria-label="DSH 主导航"><b>deepseek <small>HARNESS</small></b><span>插件</span><span>自动化任务</span><span>安全</span>
      <span aria-current="page"><Icon name="pr"/>拉取请求</span><span>更多</span><small>工作区</small>
      <button onClick={back} title="返回工作区会话"><Icon name="files"/>openwallet</button></nav>
    <div className="dg-docked"><PullPanel remote={remote} workspaces={[{sessionId:'preview',path:'openwallet'}, {sessionId:'wiesler',path:'wiesler'}]} demo/></div></div>
}
