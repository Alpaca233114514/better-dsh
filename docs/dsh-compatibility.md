# DSH 0.2 适配（2026-10-12）

> 更新：2026-10-18 的本机 DSH 0.2.1-rc.2 兼容交付见
> [dsh-0.2.1-rc.2.md](dsh-0.2.1-rc.2.md)；本文保留 0.2.1-alpha.2 基线记录。

本轮接口基线是官方 `0.2.1-alpha.2`，源码提交
[`d743267388641bc76f17c45ce8b4c231aed1d32c`](https://github.com/deepseek-ai/deepseek-harness/commit/d743267388641bc76f17c45ce8b4c231aed1d32c)，
发布时间为 2026-10-09。适配源码和本地回归验证已完成，未在新版 DSH 浏览器或真实模型会话中联调。
本机 PATH 中的 DSH 安装包仍为 `0.1.0-rc.6`；本轮没有升级该安装或修改用户 profile。

## 插件

仍使用 `cordis_define` 提交 Host / Client 函数体，然后 `cordis_run` 激活。
更新已运行插件时，保留现有 pluginId，定义新 Package 后使用 `cordis_run` 的 `update` 模式。

BetterManager 使用公共 `inventory()` / `inspectPackage(agent, pluginId, packageId)` / `define()`
接口，不再访问内部 `runner.registry` 或硬编码 `plcntr-3`。同一 DSH 进程应只运行一个
BetterManager；无法唯一识别所属会话时显示错误，避免写入另一个工作区。

旧 v1 快照可读取。恢复时 DSH 分配新的 pluginId / packageId，保留全部版本并映射原先选中的
版本；v2 快照记录 `sourcePluginId`，恢复失败或源码缺失时保留旧文件。恢复后点击
「运行已启用」执行源码。启用记录不替代用户手势，也不恢复旧批准状态。

新版运行编排器的失败可能通过 `lastRunError` 返回，Promise 本身仍正常结束。
页面订阅该状态并展示错误。待批准请求显示「批准此版本 / 拒绝」，批准不覆盖未来版本；
存在待批准请求时自动恢复内置 Cordis 面板入口。

TokenMeter 输入口径为 `inputTokens + cacheReadTokens + cacheWriteTokens`，
`reasoningTokens` 已包含在 `outputTokens` 中，不重复加入。旧累计数据保留；旧数据缺失的
缓存写入字段按 0 读取。历史漏计量无法从现有汇总文件补算。两插件落盘均遵守当前 Session
文件策略，不自行把 `read-only` 提升为可写。

## 实验性预设

新版 preset registry
[不再扫描目录](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/preset/agent-preset-registry/README.md)。
在仓库根目录生成声明 overlay：

```powershell
node dsh-anchored-standard/scripts/generate-dsh-patch.mjs --mode anchored-standard --out anchored-standard.patch.yml
dsh web --patch ./anchored-standard.patch.yml
```

另外两种模式是 `zero-anchored-standard` 与 `whoami-standard`。
生成器只创建指定的新文件，不写 profile、不安装依赖；文件已存在时拒绝覆盖。
patch 使用当前仓库的绝对模块 URL，移动仓库后重新生成。CLI `--patch` 的分层机制见
[官方 CLI 文档](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/apps/cli/README.md)。
加载后新建空白会话，选择对应预设。

三个模式均将 `persona.text` 改为 `prefix`，将已移除的 `workflow-worker-thread` 改为
`workflow-ptc`，删除已退休的 `backgroundMode` 配置。bootstrap 编辑器共享 Host 文件沙箱；
Windows Git Bash 使用 Session 当前工作目录、环境、进程沙箱和执行超时。沙箱不可用时
拒绝启动，保持原模式。技能查找和指令文件提示也使用当前工作目录。

anchored-standard 上游在
[`dda23ef`](https://github.com/xiaobright/dsh-anchored-standard/commit/dda23ef119e3715f417d73f72eca407732846d1a)
宣布冻结维护。本仓库保留原收录版本及本地扩展，增加兼容修改，并保留原许可证和版权声明。
旧 README 的轨迹与 Minimal schema 实验属于历史 DSH/V4 条件；本轮没有新版模型效果或
性能实验，不能宣称新版仍满足逐字一致的 Minimal 条件或锚定收益。

## 验证

```powershell
node --test "test/*.test.mjs"
node --test "dsh-anchored-standard/test/*.test.mjs"
node dsh-anchored-standard/scripts/sync-modes.mjs --check
```

本地测试覆盖：旧快照迁移、版本映射、部分失败重试、损坏文件保留、只读策略、token 桶口径、
旧数据读取、批准入口与单版本批准、运行失败提示、新 preset 声明、工作目录切换、进程拒绝
与超时。这些是接口和行为测试；真实模型锚定效果及新版浏览器交互仍需实机联调。

本轮结果：动态插件 11 项、预设 111 项，共 122 项通过；共享模块副本同步检查通过。
三个生成 overlay 已实际解析为 YAML，并对照最新官方源码核对全部包名与子路径导出
（分别 37 / 34 / 34 个插件配置行）。此检查不加载或执行这些包。
