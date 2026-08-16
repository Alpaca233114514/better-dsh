# better-dsh

致力于为小白提供更好体验和扩展空间的插件整合包

本仓库整合了面向 **DeepSeek Harness** 的插件、代理预设与工具，每个组件都带有独立的
README（功能 / 文件 / 使用方法 / 实现要点），方便按需选用。

## 收录内容

| 组件 | 说明 | 详情 |
| --- | --- | --- |
| [TokenMeter](TokenMeter/) | Token 计量插件：统计 token 使用量并以 GitHub 风格热力图展示 | [README](TokenMeter/README.md) |
| [BetterManager](BetterManager/) | 插件管理器：mod 菜单式管理 DSH 动态插件，带永久持久化防丢失 | [README](BetterManager/README.md) |
| [Oi](Oi/) | 第三方收录：面向 Agent Skills 的 agent-native 语言（MIT License） | [README](Oi/README.md) |
| [dsh-anchored-standard](dsh-anchored-standard/) | 第三方收录：双阶段 DSH 代理预设，首轮锚定 Minimal、晋升后按需解锁 Standard 工具（MIT License） | [README](dsh-anchored-standard/README.zh-CN.md) |

## 下载

- **方式一（推荐）**：`git clone https://github.com/Alpaca233114514/better-dsh.git`
- **方式二**：GitHub 页面 Code → Download ZIP，解压到本地

把仓库放到 DSH 的工作区，或直接以仓库目录作为 DSH 的工作区打开，
让 DSH 里的 Agent 能读到仓库文件。

## 装配到 DSH

插件、代理预设与技能在 DSH 里的装配方式不同，分开说明。

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

### 代理预设（dsh-anchored-standard）

dsh-anchored-standard 是 **agent preset**（不是动态插件），需要复制到 DSH 的
用户预设根目录后重启生效：

1. 复制 `dsh-anchored-standard/preset/` 整个目录到
   `~/.dsh/.agent-presets/anchored-standard`（Windows：`%USERPROFILE%\.dsh\...`）
2. 变体可选：`dsh-anchored-standard/zero-anchored-standard/`（固定 0 工具锚定轮）、
   `dsh-anchored-standard/whoami-standard/`（"你是谁"锚定轮）同样方式安装为独立预设 id
3. 完全重启 DeepSeek Harness，新建一个**空白会话**，在预设选择中选
   「Anchored Standard（experimental）」（或对应变体）——不要在已有会话中切换预设

每个模式目录自包含，可单独安装；详细机制与配置见
[dsh-anchored-standard/README.zh-CN.md](dsh-anchored-standard/README.zh-CN.md)。

### 更新

- **插件**：替换仓库内 `TokenMeter/`、`BetterManager/` 源码后重新 `cordis_define`
- **Oi**：从上游重新拉取覆盖 `Oi/`，并把 `Oi/plugins/oi/skills/` 下的 7 个技能目录
  重新复制到 `.agents/skills/`（详见 [NOTICE.md](NOTICE.md)）
- **dsh-anchored-standard**：从上游重新拉取覆盖 `dsh-anchored-standard/`，
  并同步更新 [NOTICE.md](NOTICE.md) 中的收录版本与著作权信息

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

## dsh-anchored-standard（第三方收录）

[dsh-anchored-standard](dsh-anchored-standard/) 是实验性的 **DeepSeek Harness 代理
preset** 集合（社区项目，非 DeepSeek 官方 preset）：把会话首个模型请求锚定在
Minimal 条件上（真实 Minimal 工具 schema、不注入自动上下文），会话产生首个持久
信号（`tool/call` 或 `assistant/message`）后晋升到小型 resident 工具目录，重型
Standard 工具（`web_search`、`subagent`、`workflow` 等）通过 `dev_tool_search`
按需解锁。

- **三种模式**：Anchored Standard（`preset/`，首轮 2 个 Minimal 工具，无额外代价）、
  Zero-Anchored Standard（`zero-anchored-standard/`，首轮 0 工具 + 固定锚定消息）、
  Whoami Standard（`whoami-standard/`，首轮 "你是谁" 自我介绍轮，子代理继承锚定流程）
- **安装**：复制对应模式目录到 `~/.dsh/.agent-presets/<id>` 后重启 DSH，
  详见上文 [代理预设（dsh-anchored-standard）](#代理预设dsh-anchored-standard) 与
  [dsh-anchored-standard/README.zh-CN.md](dsh-anchored-standard/README.zh-CN.md)
- **来源**：<https://github.com/xiaobright/dsh-anchored-standard>（MIT License，
  Copyright (c) 2026 xiaobright；Portions Copyright (c) 2026 DeepSeek）
- **收录版本**：commit `0a38616c1b7ce4219b6d94d95c89f34a90741616`（原样复制至
  `dsh-anchored-standard/`）

## 著作权与许可

- 本仓库原创插件（TokenMeter、BetterManager）遵循 [LICENSE](LICENSE)
  （Apache License 2.0）
- 第三方收录的 Oi 遵循其自身 MIT License（见 [Oi/LICENSE](Oi/LICENSE)），
  完整著作权声明见 [NOTICE.md](NOTICE.md)
- 第三方收录的 dsh-anchored-standard 遵循其自身 MIT License（见
  [dsh-anchored-standard/LICENSE](dsh-anchored-standard/LICENSE)，其派生自
  DeepSeek Harness Standard preset 的部分保留 DeepSeek 著作权声明，见
  [dsh-anchored-standard/NOTICE](dsh-anchored-standard/NOTICE)），
  完整著作权声明见 [NOTICE.md](NOTICE.md)
