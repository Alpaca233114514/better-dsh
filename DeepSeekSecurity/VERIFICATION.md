# 验证记录 · 2026-10-13 · 插件引用与执行进度

- 当前流程：`@DeepSeek Security` 原生引用 + 用户需求 → 发送 → 模型调用 `security_scan` → 输入框上方显示实际进度 → 报告回到聊天，进度框收起。
- 13 项本地回归通过：引用 codec 与取消发送、需求原样进入扫描 Agent、父会话调用与真实 Python 工作台报告回传、`security_progress` 更新观察状态、停止、RPC 错误、终态隐藏、旧轮询及会话卸载后的晚到响应。
- 进度框不提供开始按钮；初始、完成、失败、取消和中断状态均不显示空闲面板。取消失败提示不会被正常轮询吞掉。
- 实现对照了固定 Codex Security 源码的插件 manifest、语义草稿和进度结构，以及 DSH 原生 ReferenceInsert/codec、composer dock 和原生组件源码。DSH ReferenceChip 已自带 @ 标记，插件 label 只含名称。
- `npm run typecheck`、`npm run build` 通过；模型使用 scripted adapter，没有消费真实模型额度。
- 尝试额外运行 DSH 原生 composer 源码测试时，本机缓存缺少 lexical、zustand 等前端依赖，未完成该项验证；没有为此安装依赖。实际桌面输入、布局和真实模型自动选择仍未实测，不能以本地测试代替这些验证。
- 本机桌面仍链接此插件目录，需完整退出并重新打开 DSH 加载 Host 更新。未修改桌面配置、重启用户会话、提交或推送。

以下记录为此前迭代，当前交互以上述流程为准。

---
# 验证记录 · 2026-10-13

## 聊天调用入口

- 移除 Client 专用启动面板，`@security` 选择仅插入请求；发送后走 DSH 原生 `security_scan` 工具，状态、停止和报告使用会话界面。
- 旧面板将 Client RPC 的 `{ ok, value/error }` 当作 `State`，导致任务与错误未被正确展示。新版不经这条启动链路，兼容 RPC 的类型也改为 `RemoteResult<T>`。
- `npm test`：11 项通过。完整链路使用 scripted adapter，父会话发出 `security_scan`，子 AgentLoop 生成语义草稿，真实本地 Python 工作台校验并生成报告，报告进入父会话工具结果。
- 新增选择不执行、取消向下传递、失败传播和缺少工作区/模型的验证；保留生命周期、去重、重启和工作台测试。
- `npm run typecheck` 与 `npm run build` 通过；构建后的 Client 经 ModuleLoader factory 执行检查，能注册 `@security`，无需 DOM、RPC 或面板依赖。这不是桌面实点验证。
- 首轮受 Windows 沙箱 `realpath EPERM` 和 Python 启动限制影响；经正式权限审核在沙箱外重跑通过，未修改安全配置。
- 桌面 profile 的插件仍为指向本目录的 `link:` 安装，Host 改动需完整退出并重新启动 DSH。
- 本次没有消费真实模型额度，没有重启或操作用户的桌面会话。以下旧入口的浏览器及真实模型记录仅作为历史证据。

---
# 验证记录 · 2026-10-12

## 插件与 UI

- `npm run typecheck`：宿主与 Client 类型检查通过。
- `npm run build`：ESM Host 和 DSH ModuleLoader Client 构建通过。
- 生命周期测试覆盖重复启动、同工作区会话切换、持久化、取消竞态、异常、重启中断、损坏状态保留与卸载等待。
- 原版 Python workbench 测试覆盖草稿校验、完成报告、取消与失败状态。
- DSH AgentLoop 集成测试使用 scripted adapter。读/搜索工具位于一个真实 DSH 父 scope，扫描先挂载预设再限制继承工具，非允许工具不会提供给模型。
- 实际浏览器验证了亮/暗主题、620px 窄窗口和原生组件布局。
- 最终交互按最新要求改为原生 `@security`：默认无面板，候选项打开面板，关闭隐藏；呼出不发送聊天消息或启动扫描。已在 `0.2.1-alpha.2` 桌面 Host 的实际页面验证。
- 桌面设置页显示 `当前版本：0.2.1-alpha.2`；Windows 中新版 `DeepSeek Harness` 窗口已显示。运行入口和与旧安装器的边界见 `DESKTOP.md`。

## 真实模型 smoke

在独立临时目录的一份 3 行 `arithmetic.py` 上，通过原生 `session/create` 与插件 `deepseekSecurity/start` 执行。使用现有 DSH 认证和当前模型 `deepseek-account / deepseek-flash / max`。

- Scan ID：`853d2fdd-6982-44ab-bff4-0c2069296355`
- 启动：`2026-10-12T14:59:48.041Z`
- 完成：`2026-10-12T15:00:57.349Z`
- 宿主状态：`completed`；原版工作台生成 `report.md`，发现数为 0。
- 报告明确披露：无独立审计者、覆盖为 partial、只有静态源码检查，没有动态漏洞复现。
- 本机证据副本：`docs/live-smoke.json`、`docs/live-smoke-report.md`。

首次真实启动揭示了新版工具位于 Agent 预设而非全局注册表的差异；已修正为继承并保留 DSH 现有预设，再使用原生工具限制。失败记录保留在工作台和仓库 `.cache/security-live-failure-*.json`，回归夹具也改为父 scope 工具，避免再次用全局假工具掩盖该问题。

这证明了小样例的真实模型调用、工具读取、检查点和报告链路。没有进行整个 better-dsh 仓库审计、动态漏洞利用验证，也不声明与原 Codex 模型的发现质量等价。

## 目录隔离

`DeepSeekSecurity/` 和 `RichThinking/` 都是普通独立目录，不是互相指向的链接。各自具有 package.json、源码、构建脚本和产物目录；源码与构建配置中未发现跨插件引用。本次未修改 RichThinking，也未覆盖其他会话正在修改的根 README.md / NOTICE.md。没有提交或推送。
