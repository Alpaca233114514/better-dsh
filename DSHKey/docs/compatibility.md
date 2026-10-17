# DSHKey 接口与验证记录

核对日期：2026-10-16。

## 官方参考

先检查了 [DeepSeek 官方仓库](https://github.com/deepseek-ai/deepseek-harness)，远端 HEAD 为 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`。通过该提交的原始文件逐一核对快捷键、设置、输入、会话、工作区和 Chat 数据接口。

本地可执行契约测试基于已取得的 DSH **0.2.1-alpha.2** 源码 `d743267388641bc76f17c45ce8b4c231aed1d32c`。完整最新源码克隆未完成；最新提交仅做所列接口的源码核对，不宣称整个最新版本已运行验证。

| 官方文件 | DSHKey 使用方式 |
| --- | --- |
| `packages/client/shortcuts/src/client/types.ts` | `register`、`catalog`、`fixedCatalog`、`describeBinding`、`recording`、`edit` |
| `packages/client/shortcuts/src/binding.ts` / `configuration.ts` | 物理键、平台默认值、保留键和冲突规则 |
| `packages/client/ui-settings/src/client/contract/slots.ts` | `settings.section` 独立导航项 |
| `packages/client/ui-settings/src/client/config-form.ts` | Host 配置表单的带版本写入 |
| `packages/settings/settings/src/index.ts` | Host 配置命名空间注册 |
| `packages/api/session-controller/src/client/contract/sessions.ts` | 当前 `mainView` 会话与现存 binding |
| `packages/client/ui-conversation/src/client/contract/input.ts` | 输入框 focus、draft 与 notify |
| `packages/client/ui-chat/src/client/contract/snapshot.ts` / `chat-nodes.ts` | Chat 节点的正文与结束状态 |
| `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts` | 原生 `assistant-step` 节点定义 |
| `packages/client/ui-workspace/src/client/navigation.ts` | 导航、置顶与取消置顶 |

最新提交中，快捷键类型、键位规则、设置 slot、Chat 节点结构与本地基线一致。会话和工作区的变化主要扩展 preset / 创建会话流程；本插件使用的导航、置顶、取消置顶和取消生成方法保持兼容。

也检查了现有 [blue-a11y/dsh-client-shortcuts](https://github.com/blue-a11y/dsh-client-shortcuts)（`1720db39a0db41a1a8bc92705792b051c03b1273`）。该项目提供自己的同名 `ctx.shortcuts` 服务，DSHKey 使用官方已有服务，因此未引入该实现。搜索得到的另一同类项目 `csiroqa/dsh-hotkeys` 在当日 GitHub Git 查询中返回 Repository not found，未作为代码来源。

## 验证结果

- `npm run typecheck`、`npm run build`：通过，生成 Host ESM 和官方 ModuleLoader 可加载的浏览器包。
- `npm test`：15 项通过，覆盖动作目标捕获、归档与工作区过滤、输入法 / 重复键、错误通知、异步置顶互斥、清理、Host Schema、带版本表单提交和 UI 编辑失败保留。
- `test/upstream.mjs`：直接打包并运行官方 `ShortcutRegistry`、`ShortcutPersistence`，使用实际官方 store 包与其依赖；六种运行时 / 平台配置均通过。Windows / macOS 四组合额外验证冲突、过期写入、写入失败、重新加载及重置。存储适配器为测试内存，未调用 Electron IPC。
- 浏览器独立预览：录制 `Ctrl+Alt+Shift+M`、保存、恢复默认 `Ctrl+Alt+Shift+L`、浅色和深色显示均通过。
- 截图：[浅色](preview-light.png)、[深色](preview-dark.png)。两张都是演示预览，深色截图保留了改键后的状态。

尚未验证用户日常 DSH profile 的安装、完整原生客户端装配、Electron 键盘桥、真实 Host 的停止生成与置顶 RPC。后端动作目前由契约与服务替身测试覆盖，不冒充生产运行结果。
