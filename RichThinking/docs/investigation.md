# DSH 源码调查与兼容选择

调查日期：2026-10-12。源码基线：官方 `0.2.1-alpha.2` / `d743267388641bc76f17c45ce8b4c231aed1d32c`。本机已有该提交只读缓存，调查未修改上游代码。

## 已有项目

先搜索了 GitHub 的现成实现。[dsh-deep-verbs](https://github.com/Winter-And-You-Gone/dsh-deep-verbs) 增强回合状态行并根据新行 / 工具事件切词；它的页面说明与本任务“只在真实推理区域定时轮播”的需求不同。本实现使用原创两组词库，没有复制其源码。官方源码是插件接口与生命周期的依据。

## 插件加载、注册、配置

- [`decoration` 官方模板](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/preset/agent-preset/skills/cordis-plugin-development/templates/decoration) 展示 `dsh.bundle.patch`、`./client` 导出、`window.__ModuleLoader__.load({id,factory})` 和 Slot 注册。
- [`web/src/seed.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/web/src/seed.ts) 提供共享 React / ReactDOM。产物只 external 这两个前端运行期依赖。
- [`ui-renderer/src/client/registry.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-renderer/src/client/registry.ts) 定义 `slots.inject` / `register` 的 Cordis effect 生命周期。`shell.overlay` 是官方推荐的附加 Slot；这里挂载不可见控制器，仅用 Portal 渲染推理标题。
- [`ui-theme/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-theme/src/index.ts)、[`config-form-types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-settings/src/client/config-form-types.ts) 是原生 `Config` / `.volatile()` / `settings.configure` / `configForms.get(entryId)` 的参考。插件使用自动配置表单，不新建设置存储或自定义 RPC。

## 可扩展面与缺口

[`ui-chat` 的 Slot 合同](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-chat/src/client/contract/slots.ts) 和 [`register-node-renderers.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-chat/src/client/chat/register-node-renderers.ts) 确認：

| 官方扩展点 | 范围 | 本次使用 |
| --- | --- | --- |
| `conversation.chat.reasoning.body` | 展开后的完整 reasoning 正文 | 保持现有 occupant；兼容翻译等正文插件 |
| `conversation.chat.reasoning.content` | 推理 Markdown 的组件工厂 | 原生正文路径继续使用 |
| `conversation.chat.node`，key=`assistant-step` | 整个助手消息 | 不接管；接管会扩大改动范围 |
| Reasoning 标题 Slot / factory | 本版没有 | 使用下述兼容层 |
| `shell.overlay` | additive list | 挂载一个 React Portal 控制器，无浮窗 |

[`ReasoningRow.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-chat/src/client/chat/ReasoningRow.tsx) 直接传 `title={t('message.think')}` 给 `DisclosureRow`；只有正文调用 `renderSlot`。文件没有从包公共 client 出口导出，直接复制或替换整条助手渲染链不合适。

因此兼容层只识别助手行内的 `data-variant="think"`、`data-state="running"`，核对 `DisclosureRow` 和 `TextShimmer` 的结构后插入自己的 Portal 容器。原生标题保留给读屏；原生 icon、summary、事件和 body 不变。终态立即移除容器并恢复原始属性。没有 CSS class hash、i18n 文本匹配、全局 React monkey patch、组件内部对象修改或上游文件写入。

这仍依赖特定版本 DOM，而非稳定标题 API，所以 peer 精确限定该版本。未来应以官方标题 Slot 消除兼容层。

## 事件、回放与状态边界

[`assistant.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-chat/src/client/conversation-nodes/assistant.ts) 处理 `step/start`、`assistant/live-chunk`、`assistant/message`、`llm/retry`，构建原生 AssistantChatData：

- live chunk 的 `reasoning-delta` 累积原始内容；工具参数投影为独立 `tool-call` 块。
- retry 清理本次流片段；最终 assistant/message 形成 settled；已闭合的 step / turn 可形成 interrupted，并保留已有文本。
- 无增量 state 的历史回放通过 `fallbackState` 从相同事件重新投影，插件不额外持久化数据。
- [`AssistantMarkdown.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-chat/src/client/chat/AssistantMarkdown.tsx) 仅对“助手正在流式输出，且 reasoning 是最后一个块”的行传 `running=true`。正文或工具块出现后，该推理行立即结束。

| 阶段 | 插件行为 |
| --- | --- |
| 等待首个响应 / 无 reasoning 内容 | 保持原生 RunningStatus，不新建推理内容 |
| 实际 reasoning 流开始 / 持续 | 对原生 running reasoning 标题轮播；文本 token 不驱动时钟 |
| 工具准备、调用、执行 | 原生工具行保持原样，前一推理行停止轮播 |
| 工具后的新模型步骤 | 仅当新的原生推理行出现时启动 |
| 正文开始、完成、取消、错误 | 原生投影令 running=false / 行卸载，适配器撤销 |
| 重试 | 旧行隐藏 / 清理，新流重新观察 |
| 切换会话 / 隐藏分组 / 后台标签页 | 清理相应行，零历史时钟；重新可见时从 0 观察计时 |
| 历史恢复 | 不对 settled 行计时，保留原生折叠与预览 |

`RunningStatus` 的时钟是回合时钟；`TurnProcessNodeView` 用 turn 起止事件展示最终耗时，并区别 aborted / error。它们都不是逐 reasoning 块精确时长。本插件不挪用回合耗时，不伪造历史 `Thought for Ns`。

## 视觉、动画与语言

使用原生 [`DisclosureRow`](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-primitives/src/DisclosureRow.tsx) 及其图标和键盘事件，字号跟随 `--dsh-content-font-size-secondary` / `--dsh-content-font-delta`，颜色继承原生行。主题来自 `ui-theme`，没有自己的主题状态。

只给新增文案做 160ms opacity 过渡；原生 shimmer 的装饰副本在增强期间隐藏，避免旧标题高光与新文字错位。`prefers-reduced-motion` 禁用过渡。词条定宽，计时 tabular-nums；长自定义词省略并提供 title。

按用户补充要求，状态词语言独立于应用 i18n：默认中文，英文须手动选，不自动跟随系统。两个词库独立洗牌，配置字段使用原生表单的双语说明。读屏保留 DSH 自己翻译的原生标题，不播报趣味文案。


## 2026-10-13 桌面补充

本机桌面实际版本为 0.2.0-rc.2，RT 0.1.2 同时限定支持该版和已核对的 alpha.2。rc.2 的 ReasoningRow 直接渲染 MarkdownText，alpha.2 增加 reasoning body Slot；本插件不接管两者的正文。

标准模式由 ChatGroupSeat 折叠 ReasoningRow。适配层在真实 running reasoning 存在且原生 data-process-activity=thinking 时，装饰可见的分组标题；分组展开后恢复分组标题，转而装饰内部原生推理行。工具状态、完成、外层历史隐藏时撤销。底部 RunningStatus（“深度求索中”及回合时钟）按用户最终要求保持原样。

设置 schema 不会自动在插件详情页显示表单。0.1.2 显式注册 plugins.bundle.config，使用 DSH 的 Switch/Input/Button 与 configForms.mutate 原子保存，并携带编辑时的 revision；保存失败保留编辑，成功才显示已保存。
