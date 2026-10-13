# Better Manager 插件管理器

面向 DeepSeek Harness **0.2.1-alpha.2** 的动态 Cordis 插件，以卡片网格管理插件。
入口：设置 → Better Manager。完整基线与验证范围见 [DSH 适配说明](../docs/dsh-compatibility.md)。

## 功能

- 读取 DSH 全实例插件目录，查看版本、状态和失败原因，运行 / 停止 / 删除（二次确认）。
- 待批准请求提供「批准此版本 / 拒绝」，批准不覆盖未来版本；有待批准请求时显示原生 Cordis 入口。
- 默认隐藏左下角 Cordis 入口，可选隐藏设置里的插件分区；卸载时恢复原入口。
- 快照保存到所属会话工作区的 `.better-manager-plugins.json`，每 10 秒检查变化。
- 重新加载管理器后恢复缺失定义；用户点击「运行已启用」恢复运行。

## 使用

1. 让 DSH Agent 读取 `host.js` 和 `client.js`，使用 `cordis_define`（idPrefix `plcntr`）注册。
2. 使用 `cordis_run` 激活；已有插件更新时定义新的 Package 并使用 `update` 模式。
3. 同一 DSH 实例只运行一个 BetterManager。管理器身份从公开源码接口识别，不依赖固定 pluginId。

## 持久化

- 保存所有 Package 源码、启用状态和当前版本；源码无法完整读取或快照损坏时保留旧文件并提示错误。
- 支持旧 v1 快照；新版写 v2，并记录 `sourcePluginId`。恢复通过 DSH 的公开 `define()` 创建新身份，
  不再写内部注册表。pluginId / packageId 会改变，但原先选中的版本和版本源码保留。
- 旧管理器副本不重复恢复；部分版本恢复失败后可重试，已完成的版本不会重复创建。
- 恢复定义不会恢复旧批准状态或自动执行源码。用户点击运行使用 DSH 的 `startUserRun` 编排器。
- 文件写入遵守所属 Session 的沙箱策略；只读会话不能保存快照。

## 接口

Host：`dynamicCordisRunner.inventory / inspectPackage / define`、`agents`、`sessions`、`fs`、
`sandboxPolicy`、`timer`。Client：`remote.dynamicCordisRunner` 的 inventory / stopFromPanel /
undefineFromPanel，以及 `dynamicCordisRunner` 的 startUserRun / reconcileApprovals / approve /
decline / activeRuns / lastRunError。

新版 `settings.section` 只提供 `close`；所属会话信息从 Host 元数据读取。
运行失败可能通过 `lastRunError` 报告而不拒绝 Promise，页面订阅该状态显示诊断。
Host / Client 函数体必须返回 Cordis 插件；RPC 结果只包含 JSON 数据。
