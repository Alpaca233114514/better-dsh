# DSH Rich Thinking

独立的 DeepSeek Harness UI 插件：在**原生推理行**中轮播轻松的等待文案，保留原生图标、折叠、Markdown、推理预览与主题。无需 DeepSeek Security 或 BetterManager。

**默认中文，只轮播中文。** 中文、英文分为两组：中文 24 条，包括「叽里呱啦中」「琢磨中」「想法冒泡中」；英文 30 条，包括 `Pondering`、`Connecting the dots`、`Untangling`。选择英文后只轮播英文，不混播，也不随 DSH 界面语言自动切换。

状态词只是等待文案，不代表模型实际执行步骤。插件不调用模型、不创建 Agent、任务或线程，不修改消息、请求或推理协议。

## 支持版本与实现边界

- 支持 **DSH Web / 使用 Web 客户端的桌面界面，0.2.0-rc.2 与 0.2.1-alpha.2**。桌面实测为 rc.2，alpha.2 源码基线 `d743267388641bc76f17c45ce8b4c231aed1d32c`。TUI 不适用。
- 该版本的 `ReasoningRow` 属于 `ui-chat`。官方提供正文 Slot，**没有标题 Slot**；替换 `assistant-step` 会接管整个消息渲染器。
- 本插件通过官方 `shell.overlay` Slot 挂载一个无可见界面的 React 控制器，再用可撤销的 DOM 适配层把 React Portal 放入原生标题位置。保留原来的 `ReasoningRow` 实例、原生可访问标题、键盘处理、正文 Slot 和全部会话数据。没有修改上游源码。
- 对原生 DOM 结构有版本依赖；结构不匹配时保留原生 UI。升级 DSH 前重新验证；不要绕过版本检查。

调查依据、选型与生命周期见 [源码调查](docs/investigation.md)。

## 安装

仓库附带 `lib/` 构建产物，可以直接安装，不需要在 DSH 启动时编译，也没有安装脚本。

在上述支持版本的 DSH 环境执行；把路径换成你的绝对目录：

```powershell
dsh plugin --profile web add "file:C:/path/to/better-dsh/RichThinking"
```

也可以安装打包交付物：

```powershell
dsh plugin --profile web add "C:/path/to/dsh-rich-thinking-0.1.2.tgz"
```

`dsh.bundle.patch` 会声明 `rich-thinking` 插件条目。未启用 HMR 时按 DSH 的 `restart-required` 提示重启；已写入配置不等于当前界面已加载。不要把 `lib/client.js` 当作 `cordis_define` 函数体，它使用新版 DSH 原生模块加载器。

1. 在 DSH 插件管理界面确认 **DSH Rich Thinking / dsh-rich-thinking** 已启用。
2. 打开 **插件 → dsh-rich-thinking**。插件详情页提供启用、语言、中文／英文词库、追加／替换、间隔、动画和计时设置；点击 **保存设置** 后立即生效。
3. 使用会返回可展示 reasoning 的模型开始会话，运行中的原生推理行显示中文轮播词；标准模式折叠时显示在推理分组标题上。
4. 展开、折叠、Enter / Space、历史预览继续使用原生行为。

**停用**：将配置 `enabled` 设为 `false`，或通过 DSH 原生插件管理界面停用组合包。生效后立即恢复原生标题。

**卸载**：通过 DSH 原生插件管理界面移除 `dsh-rich-thinking`，或运行 `dsh plugin --profile web remove dsh-rich-thinking`。卸载不删除会话内容；无 HMR 时遵循 DSH 的重启提示。

## 配置

设置页通过官方 `plugins.bundle.config` Slot 注册。配置遵循 DSH `Config` / `Volatile` / `configForms`，保存于 DSH profile；没有额外的 localStorage 设置系统。`rich-thinking` 是配置 namespace，使用随附 patch 的默认条目 ID。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 启用增强 |
| `language` | `zh` | `zh` 或 `en`，两个词库独立轮播 |
| `vocabularyMode` | `append` | `append` 加到默认词库；`replace` 只使用所选语言自定义词库 |
| `chineseVerbs` | `[]` | 中文词库，每条一项，不必加省略号 |
| `englishVerbs` | `[]` | 英文词库，每条一项，不必加省略号 |
| `intervalMs` | `5000` | 2000–60000 毫秒；显示秒表时切词最多有约 1 秒采样延迟 |
| `animation` | `true` | 160ms 轻微淡入；关闭后仍轮播，但不做过渡 |
| `showElapsed` | `true` | 显示当前推理行本次可见期间的计时 |

配置示例（原生条目的 `config`）：

```yaml
enabled: true
language: zh
vocabularyMode: replace
chineseVerbs:
  - 叽里呱啦中
  - 琢磨中
  - 想法冒泡中
  - 脑袋转转中
englishVerbs:
  - Pondering
  - Connecting the dots
  - Untangling
intervalMs: 5000
animation: true
showElapsed: true
```

这个示例**只轮播上面四条中文**。手动设为 `language: en` 才使用三条英文。`replace` 选中语言的自定义数组为空时回退到该语言默认词库；空白项、重复词和末尾省略号会被规范化。自定义词按纯文本显示。

## 生命周期与性能

- 保留底部原生「深度求索中」及其回合时钟。仅增强原生 `ReasoningRow` 的 `running` 状态和标准折叠分组的思考标题。工具调用、等待首个响应、无 reasoning 的模型、正文输出和重试提示保留 DSH 原有展示，不编造推理行。
- 流式 token 不触发轮播；只读原生投影后的生命周期标记，不另订阅模型流，也不改变事件。
- 全插件最多一个共享定时器；历史行无定时器。只有一个自定义词且不显示时间时不启动时钟。
- 完成、取消、失败、行移除、外层历史分组隐藏、标签页隐藏、禁用和卸载均停止相应更新；卸载清理 observer、媒体查询监听、Portal、样式和设置订阅。
- 文案有固定宽度与省略显示，悬停可读完整自定义词；流式正文不随时钟重渲染。随机洗牌袋在一轮内不重复，跨轮避免紧邻重复。
- 遵循 `prefers-reduced-motion`，关闭过渡而保留文字轮播；Light / Dark / System 由 DSH 主题管理，插件继承原生颜色、字号与字体。
- 读屏保留原生「思考」标签，不每秒播报时钟，也不反复播报趣味词；视觉标签不新增键盘焦点。

**计时边界**：DSH 没有为每个 reasoning 块提供持久化起止时间。此处秒数仅为该行在当前页面被观察到运行的时间；切换视图、后台恢复或重新启用后重计。结束后恢复原生推理标题和 DSH 的回合耗时，不把观察计时写入会话，不为历史记录补造 `Thought for 19s`。

## 开发与验证

```powershell
cd RichThinking
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
npm pack
```

`npm ci --ignore-scripts` 不运行依赖安装脚本。构建使用 lockfile 固定的 TypeScript / esbuild；依赖元数据已核实。运行期 React / ReactDOM 来自 DSH 的共享模块表，构建不会打包第二份 React。

真实上游组件测试需要该版 DSH 源码（只读）：

```powershell
$env:DSH_SOURCE = 'C:/path/to/deepseek-harness'
npm test
```

若未设置，测试会尝试本仓库 `.cache/dsh-upstream-20261012`；没有源码时明确跳过原生组件／投影／设置集成测试。浏览器验证脚本使用已有 Playwright，可设置 `RICH_THINKING_PLAYWRIGHT` 为其 `index.mjs` 绝对路径、`RICH_THINKING_CHROMIUM` 为已安装 Chromium 可执行文件，再运行 `node scripts/verify-browser.mjs`。脚本仅启动本机临时验证页，不连接模型。

本次验证范围与结果见 [验证记录](docs/verification.md)。

## 主要文件

- `src/client.tsx`：原生 Slot、React Portal 与生命周期清理。
- `src/adapter.ts`：版本限定的标题定位、可见性与共享时钟。
- `src/words.ts`：中文 / 英文两组词库与洗牌袋。
- `src/index.ts`、`src/config.ts`、`src/settings.tsx`：原生配置 schema、规范化与插件详情页设置。
- `src/style.ts`：限定于插件自有标记的样式。
- `cordis.patch.yml`、`lib/`：DSH 安装声明与构建交付物。
- `test/`、`scripts/verify-browser.mjs`：回归、真实原生组件与浏览器验证。

## 已知限制

标题层是版本限定的 DOM 兼容适配，不是尚不存在的官方标题 Slot；未来有该 Slot 时应迁移。替换原生助手节点 / 修改其 DOM 的其他插件可能导致本插件保持原生显示；正文 Slot 插件不受接管。

已在本机 **DSH 桌面 0.2.0-rc.2** 安装 RT 0.1.2，验证原生设置保存及真实 DeepSeek-V4.1-Flash 会话中的中文轮播。0.2.1-alpha.2 的验证仍为源码组件与事件投影测试；没有把它等同于该版完整桌面实测。详情与尚未覆盖场景见验证记录。

本仓库原创，Apache-2.0，见 [LICENSE](LICENSE)。没有复制 Claude Code 的词库实现或第三方插件源码。
