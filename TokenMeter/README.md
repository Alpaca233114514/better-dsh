# Token Meter 计量插件

DeepSeek Harness 动态 Cordis 插件：统计 token 使用量并以 GitHub 风格热力图展示。

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

## 使用方法

在 DeepSeek Harness 会话中，让模型通过 `cordis_define` 注册动态插件：

1. `cordis_define`（插件 idPrefix：`tkmtr`，传入 `code.host` 与 `code.client`）
2. `cordis_run` 激活，批准后即可在 **设置（⚙️）→ 侧边栏「Token 计量」** 查看

## 实现要点

- **采集**：包装 `llm/stream` 瀑布事件，从每次流式调用的 `usage` chunk 读取
  `inputTokens` / `outputTokens` / `cacheReadTokens`（StreamChunk 协议，
  `@deepseek-ai/dsh-llm`）。输入按 `prompt_tokens = inputTokens + cacheReadTokens`
  计入（DeepSeek 的 `prompt_tokens` 包含缓存命中），缓存部分单独展示
- **轮次**：`agent/inbox/claimed`（起点）→ `agent/turn-stopping`（终点）配对，
  按会话归集单轮 token（含缓存）与执行时长
- **持久化**：写入 `.dsh-token-meter.json`（显式 `workspace-write` 沙箱策略），
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
