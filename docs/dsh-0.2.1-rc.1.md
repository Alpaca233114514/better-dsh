# DSH 0.2.1-rc.1 兼容与桌面交付

目标是 2026-10-17 本机正式安装的 DeepSeek Harness 桌面端，读取其内嵌包确认 DSH `0.2.1-rc.1`、Cordis `4.0.5`、Schemastery `3.18.5`。源码核对基线为官方仓库提交 [`1600d8a1`](https://github.com/deepseek-ai/deepseek-harness/commit/1600d8a1e140dcde43a1a0941940a0480712c011)，其根包版本同为 `0.2.1-rc.1`。

| 插件 | 本轮版本 |
| --- | --- |
| DeepSeek Security | 0.1.2 |
| DSHGit | 0.1.4 |
| DSHKey | 0.1.2 |
| RichThinking | 0.1.6 |
| MoonSeek | 0.1.1 |
| TokenMeter | 0.2.1 |

BetterManager 按用户要求退役：停止更新和安装，保留源码、历史文档和已有数据。Oi 是工作区技能，锚定代理是独立预设，均不作为本轮六个桌面插件安装。

## 修改

- 各插件 peer 范围加入精确的 `0.2.1-rc.1`，保留原有旧版范围；Cordis/Schemastery 同步允许当前正式版本。
- 编译测试使用固定的新版官方开发依赖，更新相应 lockfile。没有整体升级非 DSH 依赖，没有使用 `--force` 或 `--legacy-peer-deps`。
- DSHGit Gateway 测试提供 rc.1 新增的调用方 Peer 生命周期，并验证连接销毁后不能继续派发进程。生产请求的 Peer 仍由 DSH 传输层提供。
- DSHKey 官方源码合约测试支持新的 `dsh-client-store`；RichThinking 包范围断言同步到本轮支持版本。
- 统一打包脚本禁止生命周期脚本；TokenMeter 不再把桌面包重新固定为旧 rc.2 依赖。DSHGit 安装包包含已有图标许可证文档。

## 验证与复现

交付树从最新 main 整理，保留已合并的 Security 工作区边界实现与测试；没有用较早功能分支覆盖这些修复。Security 版本升为 0.1.2。六个插件均在干净检出中执行 npm ci --ignore-scripts 后构建；提供 typecheck 的四个插件均检查。最终测试基线如下：

| 范围 | 本地证据 |
| --- | --- |
| DeepSeek Security | 15 项测试，含真实 AgentLoop 的工作区逃逸边界回归 |
| DSHGit | 34 项测试，含本地临时 Git 仓库及 Gateway 合约 |
| DSHKey | 17 项测试；rc.1 官方快捷键注册表覆盖 Web/Desktop × Windows/macOS/Linux 六种组合 |
| RichThinking | 14 项测试；`DSH_SOURCE` 指向 rc.1 官方源码，包含 RunningStatus 与事件投影 |
| MoonSeek | 2 项测试 |
| TokenMeter | 7 项测试；rc.1 桌面运行时合成用量 26、峰值 26、两项 RPC schema 与持久化检查 |
| 历史动态插件及独立预设 | 另行运行既有回归；不等同于新版预设模型效果验证 |

`scripts/check-dsh-runtime.mjs` 使用目标运行时的官方 `evaluatePluginCompatibility` 检查六个包，传入空豁免表；同时从该运行时解析官方依赖、导入 Host 入口并检查 Client ModuleLoader 注册。它不执行用户模型任务，也不宣称完成浏览器交互验证。

```powershell
node scripts/check-dsh-runtime.mjs <rc.1-runtime-node_modules>
node scripts/pack-dsh-desktop.mjs
# 安装后读回实际包；使用同一目标运行时：
node scripts/check-dsh-runtime.mjs <rc.1-runtime-node_modules> <desktop-profile>
```

安装包输出到 `.cache/dsh-0.2.1-rc.1-release/`。使用目标桌面版自带的 `dsh plugin --profile desktop add <六个本地tgz> --ignore-scripts` 安装。不要使用版本豁免替代适配。

## 本机安装与审查记录

首次兼容安装使用 Security 0.1.1，并通过该分支 95 项测试。PR 整合时发现该分支落后于已审主线，因此交付采用 main 的 Security 安全边界实现（0.1.2），其余五个插件保持本轮已验证实现。下述桌面收据应以实际版本读回为准。

已通过正式桌面自带 CLI 更新 `~/.dsh/profiles/desktop`。Security 与 DSHKey 保留原有 `link:` 方式，另外四个使用本轮 tgz；因此本地仓库目录需要保留。安装前 profile 配置备份位于 `.cache/dsh-rc1-profile-before-20261017/`。

进一步使用正式安装的 Electron、官方 `loadProfileDirectory`、`createRuntimeResolution` 和 `PluginPackages` 复核：六个 Host 模块都成功导入，Host 声明的 Cordis `4.0.5` 或 Schemastery `3.18.5` 均解析到桌面内嵌副本，没有跳过的 bundle，Auto Review 保留。复现脚本为 `scripts/check-dsh-desktop.cjs`，需要 Electron 的 `ELECTRON_RUN_AS_NODE=1` 与 `--expose-internals`，仅加载模块，不启动模型会话。

检查中发现旧 DSHGit 安装目录残留的嵌套 `node_modules` 仍提供 Alpha Cordis；已将该完整目录可逆移入上述备份目录的 `dshgit-legacy-node_modules/`，没有删除。移出后官方解析器复核通过。pnpm 的缺失 peer 提示来自 profile 的 `autoInstallPeers: false`；这些依赖由 DSH 宿主提供，未通过安装第二份运行时或忽略兼容检查解决。

原有 `cordis.patch.yml`、`cordis.yml`、兼容豁免文件、pnpm workspace 设置与 bundle 列表均核对保持不变。没有关闭或修改 Auto Review，没有运行真实模型扫描，没有修改账号或会话数据。

## 手动验收

完整退出并重新打开正式桌面端后，检查插件列表显示上述版本且没有不兼容提示，然后检查：

1. Security：`@deepseek-security` 引用、发起扫描、停止、报告返回。
2. DSHGit：展开面板、差异、暂存与取消暂存；提交/推送/PR 按需要在测试仓库操作。
3. DSHKey：设置页改键与持久化、会话切换、停止及复制动作。
4. RichThinking：状态词轮播、原生鲸鱼与用时、推理折叠和设置保存。
5. MoonSeek：月之亮面/月之暗面、跟随系统及重启后的主题。
6. TokenMeter：真实会话后的计量刷新、重启后历史保留。

本轮自动检查使用本地夹具、合成数据或 scripted model adapter。真实模型审计质量、桌面视觉和日常操作由用户验收，不能由测试通过代替。
