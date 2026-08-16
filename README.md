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

## 下载

- **方式一（推荐）**：`git clone https://github.com/Alpaca233114514/better-dsh.git`
- **方式二**：GitHub 页面 Code → Download ZIP，解压到本地

把仓库放到 DSH 的工作区，或直接以仓库目录作为 DSH 的工作区打开，
让 DSH 里的 Agent 能读到仓库文件。

## 装配到 DSH

插件与技能在 DSH 里的装配方式不同，分开说明。

### 插件（TokenMeter / BetterManager）

DSH 动态插件在会话内通过 `cordis_define` 注册、`cordis_run` 激活。下载仓库后，
在 DSH 会话中让 Agent 读取仓库文件并注册：

1. **TokenMeter**：让 Agent「读取本仓库 `TokenMeter/host.js` 与 `TokenMeter/client.js`，
   用 `cordis_define`（idPrefix `tkmtr`）注册，再 `cordis_run` 激活」
2. **BetterManager**：同样操作，用 `BetterManager/host.js` / `BetterManager/client.js`
   （idPrefix `plcntr`）注册并激活

激活后可在 **设置（⚙️）→ 侧边栏**看到「Token 计量」「Better Manager」入口。
BetterManager 激活后会自动保存快照，DSH 重启后注册表为空时自动恢复全部插件
（包括 TokenMeter），防止插件丢失。

### Oi 技能（using-oi / compile-oi / format-oi / debug-oi / bench-oi / convert-oi / upgrade-oi）

本仓库已在根目录 [`.agents/skills/`](.agents/skills/) 下准备了 Oi 的 7 个技能的
DSH 可扫描副本（每技能一个 `<name>/SKILL.md` 目录，与 Oi 官方结构一致）。

- 当 DSH 的**项目根目录**（最近的含 `.git` 的祖先目录）是本仓库时，DSH 会自动扫描
  `.agents/skills`，7 个 Oi 技能自动进入会话技能目录，Agent 可直接调用
- 若 DSH 工作区不在本仓库内，任选其一：
  - 把整个仓库放进 DSH 工作区后重新打开
  - 手动把技能目录复制（或软链）到 DSH 技能根：`<项目根>/.agents/skills`、
    `<项目根>/.dsh/skills` 或 `~/.dsh/skills`（一层深、每技能一个 `<name>/SKILL.md` 目录）
- 技能说明：`using-oi` 是核心技能（加载 / 校验 / 执行版本化的 `.oi` 程序），
  其余为随附工具链（compile / format / debug / bench / convert / upgrade）的 adapter

### 更新

- **插件**：替换仓库内 `TokenMeter/`、`BetterManager/` 源码后重新 `cordis_define`
- **Oi**：从上游重新拉取覆盖 `Oi/`，并把 `Oi/plugins/oi/skills/` 下的 7 个技能目录
  重新复制到 `.agents/skills/`（详见 [NOTICE.md](NOTICE.md)）

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
