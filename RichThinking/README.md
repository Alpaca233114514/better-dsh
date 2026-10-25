# DSH Rich Thinking

> 2026-10-25：按 **DSH 0.2.x 系列**兼容，后续 rc、正式版与补丁版不再逐个添加版本号；原有最低版本和旧版例外保留。详见 [系列兼容说明](../docs/dsh-series-compatibility.md)。

当前版本支持 **DSH 0.2.1-rc.2**，开发依赖固定到该版本。验证范围见仓库 `docs/dsh-0.2.1-rc.2.md`；以下旧版记录保留为历史证据。

独立的 DeepSeek Harness UI 插件：在底部**鲸鱼尾巴旁的运行状态**轮播等待文案，替换「深度求索中」。鲸鱼尾巴和原生用时不变，推理折叠行恢复原生显示。无需 DeepSeek Security 或 BetterManager。

**默认中文，只轮播中文。** 中文、英文分为两组：中文 24 条，包括「叽里呱啦中」「琢磨中」「想法冒泡中」；英文 30 条，包括 `Pondering`、`Connecting the dots`、`Untangling`。选择英文后只轮播英文，不混播，也不随 DSH 界面语言自动切换。

状态词只是等待文案，不代表模型实际执行步骤。插件不调用模型、不创建 Agent、任务或线程，不修改消息、请求或推理协议。

## 支持版本与实现边界

- 支持 **DSH Web / 使用 Web 客户端的桌面界面，0.2.1-rc.2**；同时保留 0.2.0-rc.2、0.2.1-alpha.2 与 0.2.1-rc.1 的兼容范围。本机桌面为 rc.2；0.1.7 已安装，重启后的实机效果待验收。alpha.2 源码基线 `d743267388641bc76f17c45ce8b4c231aed1d32c`；rc.2 源码基线 `687f282e8625c6b8d11ff58211a90524be2e4317`。TUI 不适用。
- 通过官方 `shell.overlay` Slot 挂载无可见界面的 React 控制器，将 Portal 放入 `RunningStatus` 的文字位置；不修改鲸鱼节点、推理折叠行、正文或会话数据。
- 原生状态文字及其 shimmer 副本在启用期间隐藏，不会与轮播词同时显示。原生独立的读屏状态保留。
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
dsh plugin --profile web add "C:/path/to/dsh-rich-thinking-0.1.5.tgz"
```

`dsh.bundle.patch` 会声明 `rich-thinking` 插件条目。更新已安装的包后重启 DSH，确保加载新的 JavaScript 模块；已写入配置不等于当前界面已加载。不要把 `lib/client.js` 当作 `cordis_define` 函数体，它使用新版 DSH 原生模块加载器。

1. 在 DSH 插件管理界面确认 **DSH Rich Thinking / dsh-rich-thinking** 已启用。
2. 打开 **插件 → dsh-rich-thinking**。插件详情页提供启用、语言、中文／英文词库、追加／替换、间隔和动画设置；点击 **保存设置** 后立即生效。
3. 开始会话后，底部鲸鱼尾巴旁显示中文轮播词，后面的原生用时继续更新。
4. 展开、折叠、Enter / Space、历史预览继续使用原生行为。

**停用**：将配置 `enabled` 设为 `false`，或通过 DSH 原生插件管理界面停用组合包。生效后立即恢复底部原生状态文字。

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
| `intervalMs` | `5000` | 2000–60000 毫秒；与原生用时刷新独立 |
| `animation` | `true` | 从左到右逐字替换，每字约 32ms，整句最长 280ms；关闭后直接切词 |

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
```

这个示例**只轮播上面四条中文**。手动设为 `language: en` 才使用三条英文。`replace` 选中语言的自定义数组为空时回退到该语言默认词库；空白项、重复词和末尾省略号会被规范化。自定义词按纯文本显示。

## 生命周期与性能

- 只替换底部 `RunningStatus` 的状态词。等待响应、推理、工具执行和正文输出期间是否显示，由原生运行状态的挂载与卸载决定。
- 推理折叠行、分组标题和正文保持原生显示，不再加入轮播词或插件秒表。
- 用时直接读取原生状态文字的后缀，保留原格式、标点和更新节奏；不自行计时。切换插件开关、语言或页面可见性不会重算用时。旧版 `showElapsed` 配置不再影响显示，设置页也不再提供该开关。
- 最多一个共享轮播定时器，只有单条词时无需插件定时器；原生用时依然更新。
- 原生状态移除、页面隐藏、禁用及卸载时清理相应 Portal 和定时器；卸载同时清理样式与订阅。
- 文字继承原生字号和颜色，遵循 `prefers-reduced-motion`；鲸鱼图标及其动画继续由 DSH 管理。
- 轮播词不反复读屏播报；原生独立的状态提示保留。

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
- `src/adapter.ts`：版本限定的运行状态定位、原生用时同步与轮播时钟。
- `src/words.ts`：中文 / 英文两组词库与洗牌袋。
- `src/index.ts`、`src/config.ts`、`src/settings.tsx`：原生配置 schema、规范化与插件详情页设置。
- `src/style.ts`：限定于插件自有标记的样式。
- `cordis.patch.yml`、`lib/`：DSH 安装声明与构建交付物。
- `test/`、`scripts/verify-browser.mjs`：回归、真实原生组件与浏览器验证。

## 已知限制

标题层是版本限定的 DOM 兼容适配，不是尚不存在的官方标题 Slot；未来有该 Slot 时应迁移。替换原生助手节点 / 修改其 DOM 的其他插件可能导致本插件保持原生显示；正文 Slot 插件不受接管。

本次 0.1.5 的验证覆盖两个支持版本的原生组件、事件投影及本地 Chromium 验证页；浏览器加载实际构建产物，检查完整可见状态行和换词中间帧。已安装到本机 desktop profile 并回读安装内容；尚未重启验收当前窗口，也未进行真实模型会话。

本仓库原创，Apache-2.0，见 [LICENSE](LICENSE)。没有复制 Claude Code 的词库实现或第三方插件源码。
