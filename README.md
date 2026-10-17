# better-dsh

致力于为小白提供更好体验和扩展空间的插件整合包

本仓库整合了面向 **DeepSeek Harness** 的插件、代理预设与工具，每个组件都带有独立的
README（功能 / 文件 / 使用方法 / 实现要点），方便按需选用。

## 收录内容

| 组件 | 说明 | 详情 |
| --- | --- | --- |
| [TokenMeter](TokenMeter/) | Token 计量插件：统计 token 使用量并以 GitHub 风格热力图展示 | [README](TokenMeter/README.md) |
| [BetterManager](BetterManager/) | 已退役：停止更新和安装，保留历史源码与数据 | [README](BetterManager/README.md) |
| [DeepSeek Security](DeepSeekSecurity/) | 原生安全审计插件：通过 @ 引用和聊天需求调用，执行期间显示进度 | [README](DeepSeekSecurity/README.md) |
| [RichThinking](RichThinking/) | 底部运行状态词轮播，保留原生鲸鱼、用时、推理折叠与正文 | [README](RichThinking/README.md) |
| [MoonSeek](MoonSeek/) | 月面外观插件：月之亮面 / 月之暗面，统一原生卡片与月相图标 | [README](MoonSeek/README.md) |
| [DSHKey](DSHKey/) | 原生快捷键与设置，支持 DSH 0.2.1-rc.1 | [README](DSHKey/README.md) |
| [DSHGit](DSHGit/) | 原生 Git 面板，支持 DSH 0.2.1-rc.1 | [README](DSHGit/README.md) |
| [Oi](Oi/) | 第三方收录：面向 Agent Skills 的 agent-native 语言（MIT License） | [README](Oi/README.md) |
| [dsh-anchored-standard](dsh-anchored-standard/) | 第三方收录：双阶段 DSH 代理预设，首轮锚定 Minimal、晋升后按需解锁 Standard 工具（MIT License） | [README](dsh-anchored-standard/README.zh-CN.md) |

## 下载

- **方式一（推荐）**：`git clone https://github.com/Alpaca233114514/better-dsh.git`
- **方式二**：GitHub 页面 Code → Download ZIP，解压到本地

把仓库放到 DSH 的工作区，或直接以仓库目录作为 DSH 的工作区打开，
让 DSH 里的 Agent 能读到仓库文件。

## 装配到 DSH

六个原生插件的 DSH **0.2.1-rc.1** 交付与验证见 [兼容说明](docs/dsh-0.2.1-rc.1.md)。TokenMeter 已提供原生安装包；BetterManager 已退役，旧动态安装方式仅供历史参考。

插件、代理预设与技能在 DSH 里的装配方式不同，分开说明。

### DeepSeek Security（原生安全审计插件）

请注意，本插件只用于防御性网络安全目的，任何人与企业使用本插件进行骇入活动等非法行为时，本插件作者不负任何责任。

Codex Security 的来源、复用范围与许可证见 [许可证与来源声明](DeepSeekSecurity/LICENSE-DECLARATION.md)。

验证基线为 **DSH 0.2.1-alpha.2**，需要 Node.js 和可用的 Python 3。先在仓库根目录构建：

```powershell
npm --prefix DeepSeekSecurity ci --ignore-scripts
npm --prefix DeepSeekSecurity run build
```

然后通过目标 DSH 运行时的原生插件管理命令安装。以下以 Web profile 为例，将路径改为实际绝对目录：

```powershell
dsh plugin --profile web add "link:C:/path/to/better-dsh/DeepSeekSecurity" --ignore-scripts
```

桌面安装须使用桌面版附带的 `dsh` 命令，将 profile 改为 `desktop`，安装前完整退出桌面，安装后重新打开。
本机已接入的 **DeepSeek Harness Alpha** 源码桌面入口及其依赖见
[桌面安装记录](DeepSeekSecurity/DESKTOP.md)；它是独立开发构建，克隆仓库不会自动安装该桌面运行时。

使用方法：

1. 在目标工作区的输入框输入 `@`，选择 **deepseek-security**（也可搜索 `@deepseek-security`），插入插件引用。
2. 在引用后写自己的需求，例如 **`@deepseek-security 帮我扫描这段仓库`**，然后发送。
3. 模型按需求调用扫描工具后，输入框上方自动出现进度框。完成后进度框收起，报告返回聊天；进度框或聊天中的 **停止** 均可取消扫描。

没有专用启动面板或“开始扫描”按钮。仅插入插件引用不启动扫描，**发送审计请求后会消耗当前模型账号的额度**。
引用后的需求、关注点和排除项会传给扫描 Agent。需要已有结果时，直接说“查看上次安全扫描报告”。
同一工作区的活动任务会去重，切换聊天不会自动重启扫描；中断后保留检查点，不自动继续调用模型。

当前支持 Standard 静态源码审计，包括威胁模型、候选漏洞核对和报告生成；
尚未实现 Deep Scan、PR/diff 扫描和动态漏洞复现。复用 Codex Security 的公开审计流程、语义草稿与
Python 工作台，模型执行适配 DSH 原生 AgentLoop，不调用 Codex Security CLI。

插件引用、需求传递、任务进度和报告链路已通过 13 项本地测试（scripted adapter，不消费模型额度）；此前版本另有真实 DSH 小样例扫描记录，验证范围见 [验证记录](DeepSeekSecurity/VERIFICATION.md)。
开发其他原生插件时，可参考 [插件 UI 规范](DeepSeekSecurity/UI-GUIDE.md)。

### Rich Thinking（原生组合包）

支持 DSH **0.2.0-rc.2 / 0.2.1-alpha.2 的 Web 客户端**，用原生插件管理器安装独立包（将路径改为实际绝对目录）：

```powershell
dsh plugin --profile web add "file:C:/path/to/better-dsh/RichThinking"
```

默认每 5 秒轮播中文状态词，例如「叽里呱啦中」「琢磨中」；英文独立成组，手动选择才启用。
源码和构建产物均随仓库交付，设置遵循 DSH 原生配置；不依赖 DeepSeek Security。
支持版本、安装开关、配置示例及标题兼容层限制见 [RichThinking/README](RichThinking/README.md)。

### MoonSeek（原生外观插件）

将「设置 → 通用 → 外观」中的浅色、深色改为 **月之亮面 / 月之暗面**，
使用满月 / 弯月图标，卡片沿用 DSH 原生 UI 规范；保留跟随系统与原生主题持久化。
适配 DSH **0.2.1-alpha.2 Web 客户端**，构建产物已随仓库提供：

```powershell
dsh plugin --profile web add "file:C:/path/to/better-dsh/MoonSeek" --ignore-scripts
```

重启目标 profile 后生效。桌面安装与验证范围见 [MoonSeek/README](MoonSeek/README.md)。

### 插件（TokenMeter / BetterManager）

DSH 动态插件在会话内通过 `cordis_define` 注册、`cordis_run` 激活。下载仓库后，
在 DSH 会话中让 Agent 读取仓库文件并注册：

1. **TokenMeter**：让 Agent「读取本仓库 `TokenMeter/host.js` 与 `TokenMeter/client.js`，
   用 `cordis_define`（idPrefix `tkmtr`）注册，再 `cordis_run` 激活」
2. **BetterManager**：同样操作，用 `BetterManager/host.js` / `BetterManager/client.js`
   （idPrefix `plcntr`）注册并激活

激活后可在 **设置（⚙️）→ 侧边栏**看到「Token 计量」「Better Manager」入口。
BetterManager 激活后会自动保存快照，DSH 重启并重新加载管理器后自动恢复缺失定义；点击「运行已启用」恢复运行。

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

适配基线：DSH **0.2.1-alpha.2**（官方源码 `d7432673`，2026-10-09）。
新版通过配置声明加载预设，**不再扫描 `~/.dsh/.agent-presets`**。
在仓库根目录生成模式的 patch，然后通过 DSH CLI 加载：

```powershell
node dsh-anchored-standard/scripts/generate-dsh-patch.mjs --mode anchored-standard --out anchored-standard.patch.yml
dsh web --patch ./anchored-standard.patch.yml
```

`--mode` 还支持 `zero-anchored-standard` 与 `whoami-standard`。生成器只创建指定的新文件，
不会安装依赖或修改用户 profile。移动仓库后重新生成；加载后新建空白会话选择对应预设。
详细说明见 [DSH 0.2 适配说明](docs/dsh-compatibility.md)。

锚定预设上游已冻结维护，历史 V4 轨迹实验不能证明当前模型收益。

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
- **永久持久化**：快照写入 `.better-manager-plugins.json`，重新加载后恢复定义，由 DSH 分配新身份
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
历史 Minimal 条件上（bootstrap 工具对、不注入自动上下文），会话产生首个持久
信号（`tool/call` 或 `assistant/message`）后晋升到小型 resident 工具目录，重型
Standard 工具（`web_search`、`subagent`、`workflow` 等）通过 `dev_tool_search`
按需解锁。

- **三种模式**：Anchored Standard（`preset/`，首轮 2 个 Minimal 工具，无额外代价）、
  Zero-Anchored Standard（`zero-anchored-standard/`，首轮 0 工具 + 固定锚定消息）、
  Whoami Standard（`whoami-standard/`，首轮 "你是谁" 自我介绍轮，子代理继承锚定流程）
- **安装**：生成模式的 DSH 0.2 配置声明，通过 `--patch` 加载，
  详见上文 [代理预设（dsh-anchored-standard）](#代理预设dsh-anchored-standard) 与
  [dsh-anchored-standard/README.zh-CN.md](dsh-anchored-standard/README.zh-CN.md)
- **来源**：<https://github.com/xiaobright/dsh-anchored-standard>（MIT License，
  Copyright (c) 2026 xiaobright；Portions Copyright (c) 2026 DeepSeek）
- **收录版本**：commit `0a38616c1b7ce4219b6d94d95c89f34a90741616`（上游基线；本仓库另含 DSH 0.2 兼容修改）

## 验证

```powershell
node --test "test/*.test.mjs"
node --test "dsh-anchored-standard/test/*.test.mjs"
node dsh-anchored-standard/scripts/sync-modes.mjs --check
```

兼容接口与验证范围见 [DSH 0.2 适配说明](docs/dsh-compatibility.md)。

## 著作权与许可

- 本仓库原创插件（TokenMeter、BetterManager、RichThinking、MoonSeek）遵循 [LICENSE](LICENSE)
  （Apache License 2.0）
- MoonSeek 的原生外观布局参考保留 DeepSeek MIT 声明，见 [MoonSeek/NOTICE.md](MoonSeek/NOTICE.md)
- 第三方收录的 Oi 遵循其自身 MIT License（见 [Oi/LICENSE](Oi/LICENSE)），
  完整著作权声明见 [NOTICE.md](NOTICE.md)
- 第三方收录的 dsh-anchored-standard 遵循其自身 MIT License（见
  [dsh-anchored-standard/LICENSE](dsh-anchored-standard/LICENSE)，其派生自
  DeepSeek Harness Standard preset 的部分保留 DeepSeek 著作权声明，见
  [dsh-anchored-standard/NOTICE](dsh-anchored-standard/NOTICE)），
  完整著作权声明见 [NOTICE.md](NOTICE.md)
