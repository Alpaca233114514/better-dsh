# DeepSeek Security

> 0.2.1 的 Cyber 原生界面要求 **DSH >=0.2.1-rc.2 且 <0.3.0-0**；开发依赖固定到 `0.2.1-rc.2`。后续同系列版本不再逐个枚举。详见 [系列兼容说明](../docs/dsh-series-compatibility.md)。

当前 Cyber 验证范围见 [CYBER.md](CYBER.md)；文中早期版本的安装和扫描记录只保留为历史证据。

DSH 原生 Cordis 插件。将 Codex Security 可公开获得的审计流程、语义检查点和报告工作台接入 DSH 模型。**0.2.0 新增侧边栏 Cyber 入口和独立安全工作台**，提供安全发现分布图、漏洞详情、仓库、扫描历史和新建扫描抽屉。0.2.1 修复未打开仓库的加载与错误反馈，并统一中文和主界面底色。聊天中的 `@deepseek-security` 入口与扫描进度继续保留。

Cyber 界面参照用户提供的 OpenAI Daybreak Cloud 截图设计，使用 DSH 原生 `sidebar.panellist` / `main` 扩展接口与主题变量。界面功能、边界和验证方式见 [CYBER.md](CYBER.md)。

安全发现详情支持编辑七种处置状态：新发现、已分诊、处理中、已修复、不修复、重复、误报。状态按仓库与漏洞指纹独立保存，列表、图表和筛选同步更新，重启后保留。宿主接口更新后须完整退出并重新打开 DSH；仅刷新界面不会加载新增后端方法。

未结束处置的发现详情右上角显示“修复”。点击后会在当前仓库创建并打开普通 DSH 会话，使用当前工作区模型与 Ultra 选择，将固定中文修复模板和该发现的证据、代码位置、建议及来源扫描发送给模型执行修复与验证，沿用正常工具和审核流程。请求接受后发现记为“处理中”；已修复、不修复、重复和误报状态保留“新建扫描”操作。固定模板见 `src/repair.ts`。

## 使用与边界

在工作区聊天输入 `@`，从原生候选菜单选择 **deepseek-security**（也可搜索 `@deepseek-security`）。引用后写需求，例如：

```text
@deepseek-security 帮我扫描这段仓库，重点检查登录模块
```

选择时只插入引用标签，保留用户自己写的文字，不改成预设的整句扫描命令。发送时引用仅序列化为 `@deepseek-security`，不会把内部工具说明写入用户消息，模型通过 `security_scan` 把需求、关注点和排除项传给扫描 Agent。直接键入完整的 `@deepseek-security` 加需求也会作为正常消息交给模型。

扫描真正启动后，输入框上方自动显示原生风格的进度框，显示实际阶段，支持折叠和停止。完成、失败或取消后进度框自动收起；聊天发起的扫描将报告或错误返回聊天。Cyber 发起的扫描会创建并打开一条普通 DSH 会话，保留执行过程，完成后的报告与发现同步到 Cyber 的扫描记录和安全发现页，也可从扫描详情重新打开会话。新建扫描抽屉可选择模型、推理强度、整个工作区或一个相对目录／文件，并填写附加需求。安装且启用 Ultra 插件的原生委派能力后，支持 Max 的 DeepSeek 模型还可选择 Ultra，由 Ultra 插件启用 Max 和委派策略；子代理沿用本次扫描的只读目录边界。同一工作区只保留一个活动任务，切换聊天不会重启扫描。重启或插件卸载造成的中断会被记录，不会自动消费模型 Token。

**仅选择候选项或打开 Cyber 不消耗模型额度；发送审计请求或点击 Start Scan 会使用所选 DSH 模型账号额度。** 进度框与聊天的 **停止** 都会取消扫描并等待活动执行收尾。直接请求“查看上次安全扫描报告”会使用 `security_report` 读取已有结果，不启动新扫描。

当前实现 Standard 静态源码审计：威胁模型、发现、证据核对、攻击路径和报告。使用 DSH `read/glob/grep` 工具与既有 AgentLoop，未增加模型调度器。没有暴露 Deep Scan、PR/diff 扫描、动态漏洞复现或云端扫描。静态结论不能证明漏洞已被动态验证，也不代表与 Codex 模型具有相同的发现能力。

原版 SDK 的模型执行依赖 Codex 运行时。按本次明确要求，模型执行接口改用 DSH 当前 provider、model 和 reasoningEffort；原版 Codex SDK/CLI 不参与运行。进度来自实际工具调用，完成必须通过上游工作台校验并生成报告。`findingCount` 是结果中的发现数量，不承诺每项都满足最终可报告阈值；以报告内容为准。

扫描工具在执行层限制读取到当前工作区，拒绝越界路径、符号链接和 Windows junction；不继承父预设的工具。内部链接也会排除。读取/搜索有大小和数量限制，`grep` 使用字面量匹配；完整边界与回归证据见 [BOUNDARY.md](BOUNDARY.md)。

## 构建与安装

依赖 Node.js、Python 3，以及 DSH。当前接口编译和集成测试基线是 `0.2.1-rc.2`。早期版本曾在 `0.2.0-rc.2` 做原生 Web 面板加载验证，该记录不代表当前 Cyber 工作台支持旧宿主。

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
| `src/client.tsx`, `src/progress.ts`, `src/panel.css` | 原生 Cyber 导航注册、composer 进度框、RPC 状态读取和取消 |
| `src/cyber-panel.tsx`, `src/cyber.css`, `src/dashboard-state.ts`, `src/dashboard.ts` | 独立安全工作台、扫描抽屉、历史观察与漏洞身份归并 |
| `vendor/codex-security/` | 保留上游目录结构和许可证的原始源码 |
| `test/security.test.mjs` | 生命周期与真实工作台/AgentLoop 合约测试 |
| `UI-GUIDE.md` | 可供其他 DSH 插件使用的简短 UI 规范 |
| `UPSTREAM.md` | 固定上游版本、许可证和同步边界 |

模型集成测试使用明确标记的 scripted adapter，验证路由、工具和生命周期，不能当作真实模型审计成功证据。生产插件没有模拟模式或伪造进度。扫描状态按工作区区分；应由一个 DSH 宿主使用一个 Security 状态目录，不支持多个独立宿主同时写同一任务文件。

2026-10-13 当前流程通过 13 项本地测试，包含插件引用、用户需求传递、父会话调用扫描工具、子 AgentLoop 与原版报告回传、真实阶段更新、停止和失败路径；模型使用 scripted adapter。2026-10-12 旧入口另有真实 DSH 模型扫描 3 行 Python 样例的记录，不作为本次桌面或真实模型验证。详情见 [验证记录](VERIFICATION.md)。

## 源码调查依据

调用方式参考 [Codex Security 源码](https://github.com/openai/codex-security) 的插件 manifest、技能/工具与扫描进度结构，以及 [OpenAI 插件技能说明](https://developers.openai.com/plugins/concepts/skills)。DSH 适配使用 `inputTriggers.registerSource` 的引用插入与 codec、`defineTool` 和 `conversation.input.dock`。进度框使用 DSH DisclosureRow、StateDot、Button 及主题变量；浏览器入口保留 DSH ModuleLoader factory，宿主入口保持 ESM。

本目录与仓库根部的 `RichThinking/` 为独立插件，没有跨目录代码导入或共享构建产物。

## 许可证与来源

本插件复用 OpenAI Codex Security 的部分开源代码与审计资料，固定版本、复用范围及 Apache-2.0 / MIT 许可说明见 [许可证与来源声明](LICENSE-DECLARATION.md)。
