# Token Meter 计量插件

DeepSeek Harness 原生桌面插件：统计 token 使用量并以 GitHub 风格热力图展示。支持本机正式桌面 **DSH 0.2.0-rc.2**，同时保留 **0.2.1-alpha.2** 和旧动态插件入口。

## 桌面安装（推荐）

构建产物在 `lib/`，通过目标桌面版附带的 `dsh` 安装，关闭桌面后执行：

```powershell
dsh plugin --profile desktop add "file:C:/path/to/dsh-token-meter-dashboard-0.2.0-desktop.1.tgz" --ignore-scripts
```

正式 rc.2 桌面安装包在此目录运行 `npm run pack:desktop` 生成，输出到仓库 `.cache/token-meter-desktop-0.2.0-1/`；它锁定 rc.2 的 Cordis / Typert peer，避免解析到 Alpha。安装后重新打开桌面，在 **设置 → Token 计量** 查看；无需每个会话重新 `cordis_define`。Web 使用目标 Web 运行时并将 profile 改为 `web`。

开发构建：`npm ci --ignore-scripts`，`npm run build`，`npm test`。`esbuild` 是构建工具；构建时使用 npm 下载的对应平台可执行包，不执行远程安装脚本。

原生版监听整个 Host 的模型流和轮次，包括辅助模型调用；输入为非缓存输入、缓存读取、缓存写入之和，推理属于输出，不重复计入。统计从启用插件开始，不回放全部聊天记录。

数据固定保存在 **`$DSH_HOME/state/token-meter-dashboard/.dsh-token-meter.json`**（默认 `~/.dsh/state/token-meter-dashboard/`），切换工作区不会改变保存位置。首次启动时若主数据不存在，从当前已加载会话工作区中优先取最新一份旧 `.dsh-token-meter.json` 作为基线；旧文件保留。多份旧汇总无法判断是否相互重叠，因此原生版不自动相加或逐项合并。已有原生主文件后始终沿用主文件。

原生插件仅写自己的数据文件，旧工作区数据通过 DSH `fs` 服务读取。保存使用串行队列和临时文件替换；读取失败会停止覆盖并在页面提示，保存失败会显示错误并重试。此目录属于应用自身计量数据，不改变会话沙箱权限。

同一个 Host 只启用一个计量实例。迁移到原生版后应停止原来的动态 TokenMeter，避免出现重复设置入口。不要同时启动共用一个 `DSH_HOME` 的两个桌面宿主。

接口参考：[官方 DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。本次沿用官方公开 Cordis / Typert / `settings.section` 接口，没有复制第三方插件代码。验证范围见 [桌面验证记录](DESKTOP.md)。

## 功能

- **累计 Token**：输入（**含缓存命中**）+ 输出，覆盖全部模型调用
- **今日 Token**：当天用量
- **单轮峰值 Token**：一轮任务中消耗的最大 token 数（含缓存）
- **最长单次任务**：最长一轮的执行时长
- **单位切换**：统计卡支持 **M（K/M/B，国际惯例）** 与 **万/亿** 两种计量单位，
  页面右上角小按键即时切换，localStorage 记忆上次选择
- **GitHub 风格热力图**：近 52 周每日用量，悬停显示日期与数量，打开页面默认滚到最右侧查看最新记录
- **入口**：设置侧边栏「Token 计量」（自定义柱状图图标）

## 文件

| 文件 | 说明 |
| --- | --- |
| `host.js` | Host 半区源码（cordis_define 的 `code.host` 函数体）|
| `client.js` | Client 半区源码（cordis_define 的 `code.client` 函数体）|

## 旧动态插件使用方法

在 DeepSeek Harness 会话中，让模型通过 `cordis_define` 注册动态插件：

1. `cordis_define`（插件 idPrefix：`tkmtr`，传入 `code.host` 与 `code.client`）
2. `cordis_run` 激活，批准后即可在 **设置（⚙️）→ 侧边栏「Token 计量」** 查看

## 实现要点

- **采集**：包装 `llm/stream` 瀑布事件，从每次流式调用的 `usage` chunk 读取
  `inputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens`（StreamChunk 协议，
  `@deepseek-ai/dsh-llm`）。输入按 `inputTokens + cacheReadTokens + cacheWriteTokens`
  计入（三个输入桶互不重叠）；`reasoningTokens` 已包含在输出，不重复加入
- **轮次**：`agent/inbox/claimed`（起点）→ `agent/turn-stopping`（终点）配对，
  按会话归集单轮 token（含缓存）与执行时长
- **持久化**：写入 `.dsh-token-meter.json`（遵守当前 Session 沙箱策略；只读不提升为可写），
  1.5s 防抖 + 每 10s 变更心跳 + 停止时冲刷，重启不丢失。
  数据文件位置自愈：启动时扫描活跃会话工作区 / 沙箱策略根（**新会话优先**），
  **找回已有数据文件**并继续沿用；若发现多份（如迁移/续接留下的旧文件），
  逐项取最大值**吸收合并**进主文件（同源累计，max 即正确合并），不丢数据；
  没有旧文件时才写到实例稳定的沙箱根
- **通信**：Host `harness.handle('meter:state' | 'meter:diag' | 'meter:reset')`
  ↔ Client `host.call(...)`；页面打开时每 3s 轮询
- **统计范围**：本 DSH 实例当前会话的模型调用，从插件激活时刻起算

## 依赖的事件 / 服务

- 事件：`llm/stream`（waterfall）、`agent/inbox/claimed`、`agent/turn-stopping`、`agent/created`
- 服务：`fs`、`sandboxPolicy`、`sessions` / `agents`、`timer`
- Client：Slot `settings.section`、主题 token `--dsw-alias-*`

## 数据说明（v13 修复）

早期版本漏计 `cacheReadTokens`（缓存命中），导致输入被严重低估
（如真实输入 31.1M 只显示 14 万）。v13 起输入口径为
`inputTokens + cacheReadTokens`（= 提供商计费的 `prompt_tokens`）。

## DSH 0.2 更新

新增缓存写入计量，旧汇总字段按 0 读取；先完成旧数据加载再记入首次 usage，避免启动覆盖。历史遗漏的缓存写入无法从汇总数据补算。
