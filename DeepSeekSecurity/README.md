# DeepSeek Security

DSH 原生 Cordis 插件。将 Codex Security 可公开获得的审计流程、语义检查点和报告工作台接入 DSH 当前选定的模型。输入框通过原生 `@` 菜单插入 **DeepSeek Security** 引用，用户补充需求并发送后，由模型调用插件，扫描期间在输入框上方显示进度。

## 使用与边界

在工作区聊天输入 `@`，从原生候选菜单选择 **deepseek-security**（完整调用名为 `@deepseek-security`）。引用后写需求，例如：

```text
@deepseek-security 帮我扫描这段仓库，重点检查登录模块
```

选择时只插入引用标签，保留用户自己写的文字。复制和发送均使用同一个无空格标识 `@deepseek-security`，不向聊天正文追加内部指令。调用说明由宿主的工具描述提供，模型通过 `security_scan` 把需求、关注点和排除项传给扫描 Agent。直接键入完整的 `@deepseek-security` 加需求也会作为正常消息交给模型。

扫描真正启动后，输入框上方自动显示原生风格的进度框，显示实际阶段，支持折叠和停止。完成、失败或取消后进度框自动收起，报告或错误返回聊天；没有空闲启动面板、“开始扫描”按钮或专用报告弹窗。同一工作区只保留一个活动任务，切换聊天不会重启扫描。重启或插件卸载造成的中断会被记录，不会自动消费模型 Token。

进度默认折叠为当前动作、相对文件路径与动作耗时，并显示已读取文件数、搜索次数和最近活动时间；等待响应与模型分析通过实际流事件区分。展开可查看文件枚举、仓库快照、漏洞检查、候选验证和报告生成等完整步骤。计时不是完成百分比，读取计数不是审计覆盖率。步骤过多时在框内滚动，展开与步骤切换带轻量贝塞尔缓动，并尊重系统的减少动态效果设置。

**仅选择候选项不消耗模型额度；发送审计请求会使用当前选定的 DSH 模型账号额度。** 进度框与聊天的 **停止** 都会取消扫描并等待活动执行收尾。直接请求“查看上次安全扫描报告”会使用 `security_report` 读取已有结果，不启动新扫描。

当前实现 Standard 静态源码审计：威胁模型、发现、证据核对、攻击路径和报告。使用 DSH `read/glob/grep` 工具与既有 AgentLoop，未增加模型调度器。没有暴露 Deep Scan、PR/diff 扫描、动态漏洞复现或云端扫描。静态结论不能证明漏洞已被动态验证，也不代表与 Codex 模型具有相同的发现能力。

原版 SDK 的模型执行依赖 Codex 运行时。按本次明确要求，模型执行接口改用 DSH 当前 provider、model 和 reasoningEffort；原版 Codex SDK/CLI 不参与运行。进度来自实际工具调用，完成必须通过上游工作台校验并生成报告。`findingCount` 是结果中的发现数量，不承诺每项都满足最终可报告阈值；以报告内容为准。

## 构建与安装

依赖 Node.js、Python 3，以及 DSH。接口编译和集成测试基线是 `0.2.1-alpha.2`；`0.2.0-rc.2` 已做原生 Web 面板加载验证，不能据此宣称旧版完整模型扫描兼容。

```powershell
cd DeepSeekSecurity
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
```

这是宿主插件，`@deepseek-ai/*` 和 React 由 DSH 提供，vendor 内代码随插件保留。`cordis.patch.yml` 是原生 bundle 入口。开发安装使用 DSH 的本地插件安装方式，将该目录的绝对路径加入目标 profile；不要复制 `client.js` 到 BetterManager 的 userscript 目录。

构建完成后，可从任意目录安装到 Web profile（替换为实际路径）：

```powershell
dsh plugin --profile web add "link:C:/path/to/better-dsh/DeepSeekSecurity" --ignore-scripts
```

桌面用户应先完整退出 DSH，再使用桌面版附带的 `dsh` 命令，将 `web` 改为 `desktop` 安装，完成后重新打开。Host 代码更新后也需要重启。使用 `link:` 安装时，本地插件目录需要保留。

本机已配置的 **DeepSeek Harness Alpha** 入口使用独立构建的 DSH `0.2.1-alpha.2` 桌面源码；原桌面安装保留。该开发构建依赖本机准备好的运行时，并非克隆仓库即可获得的官方发行包，详见 [桌面安装记录](DESKTOP.md)。

宿主配置可指定 `python`（Python 可执行文件路径）和 `stateDirectory`（绝对目录）。默认保存至 `DSH_HOME/state/deepseek-security`，状态目录必须位于被扫描工作区之外。没有独立 HTTP 服务或守护进程；原版 Python 工作台只在读写检查点、更新阶段及生成报告时短暂启动。

## 代码地图

| 路径 | 职责 |
| --- | --- |
| `src/host.ts`, `src/tools.ts`, `src/remote.ts` | Cordis 生命周期、原生会话工具、工作区与模型绑定、兼容 RPC |
| `src/manager.ts` | 去重、状态持久化、取消、失败及重启恢复 |
| `src/driver.ts` | DSH 原生 Agent 接口与上游审计流程适配 |
| `src/workbench.ts` | 原版 Python 工作台和语义草稿契约调用 |
| `src/mention.ts` | 原生插件引用与发送时序列化，保留后续用户需求 |
| `src/client.tsx`, `src/progress.ts`, `src/panel.css` | 仅在任务执行期间显示的 composer 进度框、RPC 状态读取和取消 |
| `vendor/codex-security/` | 保留上游目录结构和许可证的原始源码 |
| `test/security.test.mjs` | 生命周期与真实工作台/AgentLoop 合约测试 |
| `UI-GUIDE.md` | 可供其他 DSH 插件使用的简短 UI 规范 |
| `UPSTREAM.md` | 固定上游版本、许可证和同步边界 |

模型集成测试使用明确标记的 scripted adapter，验证路由、工具和生命周期，不能当作真实模型审计成功证据。生产插件没有模拟模式或伪造进度。扫描状态按工作区区分；应由一个 DSH 宿主使用一个 Security 状态目录，不支持多个独立宿主同时写同一任务文件。

2026-10-13 当前流程通过 13 项本地测试，包含插件引用、用户需求传递、父会话调用扫描工具、子 AgentLoop 与原版报告回传、真实阶段更新、停止和失败路径；模型使用 scripted adapter。2026-10-12 旧入口另有真实 DSH 模型扫描 3 行 Python 样例的记录，不作为本次桌面或真实模型验证。详情见 [验证记录](VERIFICATION.md)。

## 源码调查依据

调用方式参考 [Codex Security 源码](https://github.com/openai/codex-security) 的插件 manifest、技能/工具与扫描进度结构，以及 [OpenAI 插件技能说明](https://developers.openai.com/plugins/concepts/skills)。DSH 适配使用 `inputTriggers.registerSource` 的引用插入与 codec、`defineTool` 和 `conversation.input.dock`。进度框按 DSH TodoPanel 布局，使用原生图标、StateDot、Button 及主题变量；浏览器入口保留 DSH ModuleLoader factory，宿主入口保持 ESM。

本目录与仓库根部的 `RichThinking/` 为独立插件，没有跨目录代码导入或共享构建产物。
