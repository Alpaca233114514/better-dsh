# 验证记录

## 当前版本：RT 0.1.2（2026-10-13）

- 已通过 DSH 原生插件管理器安装到 desktop profile；详情页显示 v0.1.2，组件运行中。
- 原生设置页已实测：中文词库多行编辑、切换间隔保存；界面回执“已保存，立即生效”，profile 回读确认对应数组与 intervalMs。
- 真实模型：DeepSeek-V4.1-Flash / Max，专用“Rich Thinking UI 平方和验收”会话。运行截图分别显示“串起线索中… 5s”和“细细琢磨中… 10s”，底部原生“深度求索中”保留。该回合已结束。
- 会话日志确认该测试回合有真实 reasoning（7522 字符）与正文（1636 字符）；它未重新调用文件工具，因此本轮不声称实机覆盖了工具交替。之前回合有 read 工具和两段 reasoning，但未据此声称修正版工具阶段已完成目视验收。
- 最终行为：上方推理标题轮播，底部 RunningStatus 保持原样。底部替换实验未安装，不属于交付版本。
- 类型检查、构建及 25 项测试通过；覆盖原生设置写入／拒绝／只读、折叠分组、流式正文、取消／失败／重试投影、词库隔离、历史零时钟、共享时钟与底部指示器不变。
- 未单独进行完整桌面取消、失败重试、长会话压力、英文在线模型和所有主题切换验收；这些仍以组件／确定性测试或先前浏览器验证为限。

## 初始版本历史记录（以下不代表当前安装状态）

日期：2026-10-12。基线：DSH `0.2.1-alpha.2`，官方源码提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。

## 已执行

| 检查 | 结果 |
| --- | --- |
| TypeScript strict 类型检查 | 通过 |
| Host ESM / DSH Client 模块构建 | 通过 |
| 插件测试 | 22 项通过，0 跳过 |
| 真实上游 ReasoningRow / DisclosureRow / TextShimmer 挂载 | 通过：Portal、键盘展开、流式正文传递、展开状态保留、终态、卸载 |
| 真实上游 assistantDefinition 投影 | 通过：reasoning/tool/text、重试、取消、错误、历史回放 |
| Chromium 浏览器检查 | 7 组通过，无 pageerror |
| better-dsh 既有插件回归 | 11 项通过 |
| npm 打包 | 通过；约 20 KB tgz，包含原生 patch、Host/Client 产物、许可和说明 |

浏览器验证覆盖中文轮播及稳定宽度、Enter 展开、流式正文 Slot、暗色原生 token、减少动态效果、禁用动画、360px 视口、Space 折叠、完成、启用 / 停用 / 卸载。Light / Dark 截图已目视检查。System 使用 DSH 已有主题解析结果，插件无独立主题控制逻辑；没有另运行完整 DSH 的系统主题设置流程。

性能行为测试覆盖 1000 条历史行零时钟、多个可见活动推理行共享一个时钟、20 分钟模拟运行、流式 Markdown DOM 频繁替换不重建 / 饿死时钟、行切换、后台标签页和隐藏分组清理。这里是确定性资源行为验证，没有声称测得真实模型性能收益。

## 对用户测试清单的对应

| 场景 | 证据与限制 |
| --- | --- |
| 推理模型流式输出 | 真实上游事件投影 + 原生组件，未调用在线模型 |
| 无推理模型 | 无 reasoning 行不产生 Portal / 计时，不生成假内容 |
| 长推理 | 模拟时钟推进 20 分钟，始终一个共享计时器 |
| 工具与推理交替 | 原生工具块终止 preceding reasoning running 条件；工具 DOM 未改动 |
| 中途取消 | 原生闭合 turn 投影为 interrupted，适配器撤销 |
| 错误、重试 | 原生投影清流 / interrupted 验证，旧行移除及新流重新计时 |
| 历史恢复 | 真正的 fallbackState 回放 + 1000 历史行资源测试 |
| 明暗主题 | 真实上游 CSS / design tokens 的 Chromium 截图和 computed style 比对 |
| 开关 | 原生设置 mirror 接口、即时恢复、监听和样式清理 |
| 多会话切换 | 多活动 DOM / 移除 / 隐藏的组件测试，未操作完整 DSH 会话导航 |

## 测试夹具范围

`scripts/native-fixture.mjs` 从 `DSH_SOURCE` 或本仓库已有缓存只读加载真实官方 TSX / CSS，直接编译原生实现。没有改写官方组件。生命周期 test 直接调用官方事件投影。测试夹具提供 disclosure hook、settings mirror 和正文 Slot；正文 Slot 用测试内容验证原文与组件身份，不是完整 Markdown 渲染链。

`src/contracts.ts` 是消费到的公共服务接口的窄结构类型，不冒充官方 SDK 全量类型检查。`package.test.mjs` 核对生成产物的 DSH loader 契约、共享 React、原生 schema 与设置注册。

## 未验证

- 完整 DSH 0.2.1-alpha.2 profile 的安装后启动与真实模型端到端会话。
- 所有第三方 Conversation UI 插件的组合；正文 Slot 保留，但替换整个节点或变更 DOM 的插件需另测。
- 其他 DSH 版本；peer 精确限定，DOM 不匹配则保持原生。

开发机原有 DSH 为旧版安装，没有升级或写用户 profile。没有新增模型调用、Agent、线程、网络后台任务。
