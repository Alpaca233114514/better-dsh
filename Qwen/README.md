# dsh-qwen 0.2.1

> 2026-10-25：已适配 DSH **0.2.1-rc.3**，保留原有旧版范围。统一策略、安装版本和验证边界见 [rc.3 兼容记录](../docs/dsh-0.2.1-rc.3.md)。

面向 **DeepSeek Harness 0.2.1-rc.2** 的 Qwen Chat Completions 提供方。重新实现配置解析、模型目录和 Host 注册，使用 DSH 官方 `PiAiAdapter` 处理消息、图片、工具调用、用量与历史回放。

2026-10-18 已核实官方 GitHub 最新标签与 npm `next` 均为 `0.2.1-rc.2`；npm `latest` 为 `0.2.0-rc.2`，安装运行时请明确指定目标版本。

## 修复内容

- 修复启动失败：Schemastery 会把省略的 `input` 解析成 `[]`，旧版随后报「declares no input modality」。现在空数组继承模型预设。
- 支持网关别名：`cmaas-qwen3.8-flash` 保持原始请求 ID，同时继承 Flash 的上下文和图片能力；其他别名可指定 `preset`。
- 思考模型与非思考模型可共用路由，非思考模型不会误用默认的 `high`。
- 支持 `budget` 和 `effort` 两种思考策略，可按模型覆盖；一次请求只发其中一种参数。
- 使用兼容模式的 `max_tokens`，保留显式输出上限；默认不要求服务端支持 strict 工具模式。
- 使用 DSH 凭据服务与启动环境。凭据服务返回缺失时明确报错，不再绕到其他环境凭据。
- 默认端点改为公共 DashScope 地址；私有 Maas 工作空间需要配置自己的地址。

## 安装与配置

从仓库构建打包：

```powershell
cd Qwen
npm ci --ignore-scripts
npm test
npm pack
```

使用目标 DSH 运行时自带的原生插件管理器安装：

```powershell
dsh plugin --profile desktop add "file:C:/path/to/better-dsh/Qwen/dsh-qwen-0.2.0.tgz" --ignore-scripts
```

插件 bundle 自动注册 `qwen-flash` 路由，默认模型 `qwen3.8-flash`。通过 DSH 凭据管理保存 `QWEN_API_KEY`，重启目标 profile，再在模型选择器中选择本插件路由。

公共 DashScope 可直接使用默认配置。Maas 用户在 profile 的 `cordis.patch.yml` 增加以下覆盖，将地址替换成自己的工作空间端点：

```yaml
- id: qwen
  config:
    baseURL: https://YOUR-WORKSPACE.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
    models:
      - id: cmaas-qwen3.8-flash
        preset: qwen3.8-flash
```

**原有 `qwen` 路由与本插件的 `qwen-flash` 是两个提供方。** 如果聊天或 `agent-default-model` 还选择 `qwen / cmaas-qwen3.8-flash`，请求不会经过本插件。需在选择器中切换；若配置默认模型，覆盖为：

```yaml
- id: agent-default-model
  config:
    provider: qwen-flash
    model: cmaas-qwen3.8-flash
```

模型 ID 必须与上方插件的 `models` 配置一致。公共 DashScope 使用默认的 `qwen3.8-flash`。无需删除旧提供方或其模型目录。

## 思考策略

默认 `thinkingMode: budget`，保留现有配置语义：

| DSH 等级 | 请求参数 |
| --- | --- |
| off | `enable_thinking: false` |
| minimal | `enable_thinking: true`，`thinking_budget: 1024` |
| low | `enable_thinking: true`，`thinking_budget: 4096` |
| medium | `enable_thinking: true`，`thinking_budget: 16384` |
| high | `enable_thinking: true`，`thinking_budget: 32768` |

配置 `thinkingMode: effort` 后，开启思考时发送同名的 `reasoning_effort`，不发送预算。服务端如何映射等级由模型决定。仅支持开关的模型应继续使用预算模式；非思考模型设 `thinking: false`。

`thinkingBudgets` 可覆盖四档预算，必须严格递增。预算与答案共享输出上限，DSH/pi-ai 会预留答案空间并钳制预算。`xhigh`、`max` 暂不暴露。

模型支持 `id`、`name`、`preset`、`contextWindow`、`maxTokens`、`input`、`thinking`、`thinkingMode`。已知 Flash/Max 预设为 1,000,000 上下文、131,072 输出、文本与图片输入。未知模型默认文本输入、262,144 上下文、32,768 输出，请按实际部署覆盖；不要把图片生成、语音、嵌入或重排端点填入聊天模型目录。

## 验证

`npm test` 覆盖 15 项模型目录与打包断言。另有实际桌面运行时集成脚本，所有 HTTP 均拦截为分片 SSE，不使用真实凭据或模型额度：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& '<DSH 安装目录>/DeepSeek Harness.exe' --expose-internals `
  Qwen/scripts/test-runtime.mjs `
  '<DSH 安装目录>/resources/app.asar/dsh' `
  "$env:USERPROFILE/.dsh/profiles/desktop"
```

覆盖官方兼容门禁、真实 Cordis 注册/卸载、配置解析、思考预算/强度、中文流式响应、模型别名、非思考模型、prepared call、缺失凭据、多轮工具回放、401 和流截断。运行前先构建。脚本只读目标 profile，不安装、不改配置。

这些是实际 DSH 模块上的离线协议验证，不代表服务端真实请求或桌面 UI 已验收。

## 实现依据

- [DSH 官方 rc.2 接口](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.2/packages/llm/llm-pi-ai)：通过公开模块调用宿主适配器。
- [Qwen Chat Completions 文档](https://docs.qwencloud.com/api-reference/chat/openai-chat)：思考开关、预算和强度参数。
- 已检索 [社区 Token Plan Responses 插件](https://github.com/nickhelion/dsh-plugins)，其协议和账户场景不同；本包未复制该项目代码。

本包 Apache-2.0；宿主 DSH / pi-ai 由目标运行时提供，未复制进发布包。
