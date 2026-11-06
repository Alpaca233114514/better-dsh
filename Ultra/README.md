# Ultra

DSH 原生插件 `dsh-ultra` **0.1.4**，配合 `thinking-level` **0.1.13**，支持 DSH **0.2.1-rc.3** 与 **0.2.2-rc.1**。

`0.1.4` 在启用官方智能体团队工具时注入强制团队协作指令，未启用时保留普通原生子代理行为。

`0.1.3` 增加 DSH `0.2.2-rc.1` 的明确兼容声明，保留原有模式、提示词与 Max 参数语义。验证记录见 [0.1.3](verification/0.1.3/README.md)。

Ultra 只让 DeepSeek 更积极地使用 **DSH 原生子代理**。主代理正常使用 `max`，原生子代理按宿主规则继承 Max；明确指定 effort 时遵循 DSH 原生工具已开放的参数和权限。

## 使用

在原有推理滑条选择 **Ultra**，系统提示词明确要求：**每个新用户任务必须先启动至少一个 DSH 原生子代理**，无需等待用户另行要求。优先委派研究、独立模块分析、测试验证和第二视角检查；没有独立实现分支时也要安排独立核验，不能因为任务简单而跳过。同一任务继续推进时可复用已有子代理，主代理同步处理主线并核对返回结果。

这是系统提示词中的强制要求，没有另加调度器硬拦截模型。更具体的用户禁止委派指令、原生工具不可用或宿主限制仍须遵守；启动失败须如实说明，不伪造子代理活动。是否在真实 DeepSeek 任务中稳定遵循，仍需实际运行观察。

启用官方智能体团队插件 `@deepseek-ai/dsh-experimental-agent-team-profile` 后，Ultra 根据当前会话步骤实际可用的 `spawn_teammate` 工具切换为 **必须使用 DeepSeek 原生 Agent Teams**：每个新任务先创建至少一名队友，通过原生共享任务板登记、分配和核验委派工作，使用 `list_agents`、`send_message`、`wait_agent` 协作，收到并检查必要队友结果后再回答。继续同一任务时复用现有队友；只有主代理创建队友，不要求队友递归创建团队。团队关闭时恢复普通原生子代理要求；仅安装包而未启用不会触发团队指令。检测和工具参数基于本机 DSH 0.2.2-rc.1，不假定后续版本接口不变。

切回 Max 或其他档位退出 Ultra。`/model` 的原生选择也会退出此模式；重置按钮仍恢复当前模型默认档位。模式按聊天保存，刷新或重启后恢复。

没有额外的代理活动面板，没有自定义委派工具，没有额外 effort 控制接口。代理状态、消息、继续和取消都沿用 DSH 原生能力。

滑条保持原有 280px 浮层和动画，不增加解释小字。有 Ultra 时特殊效果只绑定 Ultra，否则绑定 Max。只有支持 Max 的 DeepSeek 模型增加虚拟 Ultra 档，提交给模型的参数仍是 Max；其他提供方原有的真实 Ultra 参数不受影响。

## 安装

退出桌面 DSH 后，通过桌面版附带的原生 CLI 安装，再重新打开：

```powershell
dsh plugin --profile desktop add "C:/path/to/better-dsh/Ultra/release/0.1.4/dsh-ultra-0.1.4.tgz" "C:/path/to/better-dsh/ReasoningSlider/release/0.1.13/thinking-level-0.1.13.tgz" --ignore-scripts
```

插件不会更改原生子代理的容量、深度、权限、审批或取消规则，不改动 Auto Review。当前宿主未提供原生 spawn 或模型不支持 Max 时，不提供虚拟 Ultra 档。安装包不包含 Demo 和测试模型。

## 实现与验证

`src/host.ts` 只处理会话模式、主动委派提示及主代理 Max 参数。`src/client.tsx` 只提供滑条使用的可选服务，不注册界面面板。旧版本 plugin records 保留兼容读取，但不再追踪或控制子代理。

当前单元测试共 13 项，包含团队工具按步骤启用/关闭时的提示切换、退出 Ultra 后移除指令、共享任务板要求与 Max 参数保持。新增宿主测试模拟协议和工具边界，不等同于桌面加载或真实 DeepSeek 团队执行验证。

11 项单元测试通过。隔离 DSH 的实际运行验证了原生 `subagent` 工具启动两个子代理、二者默认继承 Max、请求中不再提供自定义工具，以及 Ultra/Max 切换、会话恢复和界面没有额外面板。详见 `verification/`。

这些验证使用本地脚本模型，不消费外部模型额度；不证明 DeepSeek 在真实任务中的委派频率或质量提升。

```powershell
npm --prefix Ultra ci --ignore-scripts
npm --prefix Ultra run build
npm --prefix Ultra test
```

构建依赖固定为 esbuild 0.25.12、zod 4.6.6，来源及安装脚本已核对。`demo/` 与 `verification/0.1.0/` 保留早期设计与验证历史，不代表当前正式版的代理面板。

## 来源

实现参考 [DSH 原生子代理接口](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/subagent) 与 [OpenAI Subagents 文档](https://learn.chatgpt.com/docs/agent-configuration/subagents)，未复制社区代理插件代码。正式插件代码采用仓库 Apache-2.0 许可证；打包 Zod 的 MIT 许可见 `THIRD-PARTY-NOTICES.md`。历史 Demo 的 DSH 主题许可保留于 `ReasoningSlider/demo/vendor/DSH-LICENSE`。
