# better-dsh

致力于为小白提供更好体验和扩展空间的插件整合包

本仓库整合了面向 **DeepSeek Harness** 的插件与工具，每个组件都带有独立的
README（功能 / 文件 / 使用方法 / 实现要点），方便按需选用。

## 收录内容

| 组件 | 说明 | 详情 |
| --- | --- | --- |
| [TokenMeter](TokenMeter/) | Token 计量插件：统计 token 使用量并以 GitHub 风格热力图展示 | [README](TokenMeter/README.md) |
| [BetterManager](BetterManager/) | 插件管理器：mod 菜单式管理 DSH 动态插件，带永久持久化防丢失 | [README](BetterManager/README.md) |
| [Oi](Oi/) | 第三方收录：面向 Agent Skills 的 agent-native 语言（MIT License） | [README](Oi/README.md) |

## TokenMeter（Token 计量插件）

DeepSeek Harness 动态 Cordis 插件：统计 token 使用量并以 GitHub 风格热力图展示。

- **累计 / 今日 / 单轮峰值 Token** 统计（输入含缓存命中）
- **单位切换**：M（K/M/B）与 万/亿 两种计量单位，localStorage 记忆
- **GitHub 风格热力图**：近 52 周每日用量，悬停查看日期与数量
- **入口**：设置侧边栏「Token 计量」

用法：`cordis_define`（idPrefix `tkmtr`）注册 → `cordis_run` 激活。
详见 [TokenMeter/README.md](TokenMeter/README.md)。

## BetterManager（插件管理器）

DeepSeek Harness 动态 Cordis 插件：代替内置左下角 Cordis 插件面板，
像 Minecraft 的 mod 菜单一样管理 DSH 动态插件，并带**永久持久化**防丢失。

- **插件列表 / 开关 / 删除**：与内置面板同源的注册表清单，一键运行 / 停止
- **永久持久化**：快照写入 `.better-manager-plugins.json`，进程重启后自动恢复
- **隐去左下角入口**：默认隐藏内置「cordis-panel」左下角按钮
- **入口**：设置侧边栏「Better Manager」

用法：`cordis_define`（idPrefix `plcntr`）注册 → `cordis_run` 激活。
详见 [BetterManager/README.md](BetterManager/README.md)。

## Oi（第三方收录）

[Oi](Oi/) 是一个面向 Agent Skills 的 agent-native 语言：为目标的编写与运行
提供显式的结构（目标、约束、分支、失败处理与停止条件），同时留给 Agent
在边界内自由理解上下文、选择方法。使用 Skills 作为主要交付与执行单元，
无需二进制编译器或独立虚拟机。

- 来源：<https://github.com/oi-language/oi>（MIT License，Copyright (c) 2026 Oi contributors）
- 收录版本：commit `f8e9606644a65d642adf91a8dabf679f918a6f8c`（原样复制至 `Oi/`）
- 文档：语言设计见 [Oi/docs/language/design.md](Oi/docs/language/design.md)，
  使用方式见 [Oi/README.zh-CN.md](Oi/README.zh-CN.md)

## 著作权与许可

- 本仓库原创插件（TokenMeter、BetterManager）遵循 [LICENSE](LICENSE)
  （Apache License 2.0）
- 第三方收录的 Oi 遵循其自身 MIT License（见 [Oi/LICENSE](Oi/LICENSE)），
  完整著作权声明见 [NOTICE.md](NOTICE.md)
