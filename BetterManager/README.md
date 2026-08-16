# Better Manager 插件管理器

DeepSeek Harness 动态 Cordis 插件：**代替内置的左下角 Cordis 插件面板**，像 Minecraft 的 mod 菜单一样管理 DSH 动态插件目录（注册表）中的 cordis 插件，并带有**永久持久化**能力，防止插件丢失。

## 功能

- **插件列表**：读取 DSH 动态插件注册表（`dynamicCordisRunner.inventory`，与内置左下角面板完全同源），卡片网格展示每个插件的名称、pluginId、用途描述、状态（运行中 / 未运行 / 等待批准 / 运行失败）、当前 Package 与版本数
- **开关**：一键运行 / 停止。运行走客户端运行编排器（`startUserRun`，用户点击即授权），停止走 `stopFromPanel`
- **删除**：`undefineFromPanel` 从 DSH 插件目录中永久移除（二次确认）
- **永久持久化（防丢失）**：
  - **保存快照**：把整个注册表（全部插件 + 全部 Package 源码 + 启用状态）写入工作区根目录 `.better-manager-plugins.json`，每 10 秒自动检测变化落盘，也有「保存快照」按钮
  - **自动恢复**：进程重启后注册表为空时，Host 启动即自动从快照重建全部插件定义（**保留原 pluginId**），Client 自动运行快照中标记为已启用的插件 —— 防止插件丢失
  - **手动恢复**：「从快照恢复」按钮恢复缺失的插件定义，「运行已启用的 N 个插件」一键运行
- **隐去左下角入口**：默认隐藏内置的「cordis-panel」左下角按钮 —— 用同 id + 更低优先级注册空渲染覆盖内置入口，关闭开关（或刷新页面后默认值恢复）即还原内置面板；**停止/删除本插件时左下角入口自动恢复显示**（fiber 级联 + ctx.effect 双保险）
- **隐去设置插件分区**（可选，默认关闭）：同样方式隐藏设置里的「插件」分区
- **自动刷新**：打开页面后每 5 秒重新拉取清单，也有手动刷新按钮
- **入口**：设置侧边栏「Better Manager」（自定义方块图标）

## 文件

| 文件 | 说明 |
| --- | --- |
| `host.js` | Host 半区源码（cordis_define 的 `code.host` 函数体）：持久化快照 + 自动恢复 |
| `client.js` | Client 半区源码（cordis_define 的 `code.client` 函数体）：mod 菜单 UI + 隐藏入口 + 快照操作 |

## 使用方法

在 DeepSeek Harness 会话中，让模型通过 `cordis_define` 注册动态插件：

1. `cordis_define`（插件 idPrefix：`plcntr`，同时传 `code.host` 与 `code.client`）
2. `cordis_run` 激活，批准后即可在 **设置（⚙️）→ 侧边栏「Better Manager」** 查看与管理插件
3. 首次运行后会自动保存快照；之后 DSH 重启，只要重新加载本插件（定义 + 运行），注册表为空时会自动从快照恢复全部插件并运行已启用的

## 持久化设计

- **快照文件**：`<工作区根目录>/.better-manager-plugins.json`（workspace-write 沙箱内可写）
- **保存**：Host 每 10 秒对比当前注册表与上次快照，有变化才落盘；插件开关 / 删除后自动更新；「保存快照」按钮强制立即保存
- **自动恢复**：Host `apply` 时若注册表为空（进程重启）且快照存在 → 用 `runner.registry.add` 以原 pluginId 重建记录，再用 `runner.define` 重建全部 Package；Client 收到 `autoRestored` 标记后自动 `startUserRun` 运行快照中已启用的插件
- **防误删**：自动保存时若注册表为空但快照里原本有插件，跳过不覆盖（防止恢复失败时把旧快照冲掉）
- **删除语义**：通过 Better Manager 删除插件后，快照在下一次保存时不再包含它（重启后不会复活）

## 数据源与能力

- **清单 / 停止 / 删除**：`ctx.get('remote.dynamicCordisRunner')`（`inventory()` / `stopFromPanel(sessionId, pluginId)` / `undefineFromPanel(sessionId, pluginId)`），返回 Remote 信封 `{ ok, value | error }`。注意不能写 `ctx.get('remote').dynamicCordisRunner` —— remote 命名空间是 Cordis 上下文代理，点号路径会以 `'remote.dynamicCordisRunner'` 全名走守卫（`cannot get property ... without inject`），必须直接取服务键或声明 `inject: ['remote.dynamicCordisRunner', …]`（内置面板正是后者）
- **运行**：`ctx.get('dynamicCordisRunner').startUserRun({ agentId, pluginId, packageId, mode, hasClientHalf })` —— 与内置面板的 `onRun` 同一调用方式，用户手势即授权，无需额外批准
- **持久化（Host）**：`ctx.get('dynamicCordisRunner')` 的 `define()`（重建 Package）与 `registry`（读取/重建插件记录）；`inventory()` 读取清单
- **隐藏入口**：`sidebar.footer.action` 的 `cordis-panel` 单元格与 `settings.section` 的 `plugins` 单元格，用更低优先级覆盖内置（priority 升序取每单元格胜者，败者保留在账本中，dispose 后自动恢复）

## 实现要点

- Host + Client 双半区：数据全部来自 DSH 自身的服务，不扫描任何本地目录
- 动态插件每次页面刷新后重新 apply，隐藏开关恢复默认（左下角入口默认隐藏）
- 状态推导：`activeRun` 存在或 `latestRun.status` 为 running/client-pending/starting-host/waiting → 运行中；awaiting-approval → 等待批准；failed → 运行失败；其余 → 未运行
- 防呆：停止/删除本插件时，ctx.effect 卸载清理显式 dispose 两个隐藏注册，左下角内置入口必定恢复

## 依赖的服务

- Host：`dynamicCordisRunner`（define / registry / inventory）、`fs`、`sessions` / `agents`、`timer`
- Client：`remote.dynamicCordisRunner`、`dynamicCordisRunner`、Slot `settings.section` / `sidebar.footer.action`、主题 token `--dsw-alias-*`
