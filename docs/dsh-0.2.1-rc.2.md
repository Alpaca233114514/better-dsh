# DSH 0.2.1-rc.2 兼容与桌面交付

目标是 2026-10-18 本机正式安装的 DeepSeek Harness 桌面端。实际读取桌面内嵌包确认
DSH `0.2.1-rc.2`、Cordis `4.0.5`、Schemastery `3.18.5`；源码核对基线为官方仓库
tag [`dsh-v0.2.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)
（提交 `687f282e`）。上一轮交付记录见 [0.2.1-rc.1](dsh-0.2.1-rc.1.md)。

## 问题与原因

桌面升级到 rc.2 后，设置中的六个已安装插件全部显示「异常」。用桌面自带的
`loadProfileDirectory` 读取 profile 后确认：六个 bundle 都出现在 `skippedBundles` 中，
原因是 manifest 的 DSH peer 范围只写到 `0.2.1-rc.1`，而 rc.2 的
`evaluatePluginCompatibility` 会阻止启动未命中范围的 bundle。插件 Host 入口本身仍可正常导入，
不是运行时 API 被删除。

同时核对了 rc.1 到 rc.2 的源码差异（[compare](https://github.com/deepseek-ai/deepseek-harness/compare/1600d8a1e140dcde43a1a0941940a0480712c011...687f282e8625c6b8d11ff58211a90524be2e4317)）：
本轮改动主要是新增 `dsh-client-ui-deepseek-model-label-1017`、DeepSeek Search/Fetch API
插件与 `conversation.input.model.label` 的官方占用；六个插件使用的模块导出与 Host/Client
接口没有移除或改名。因此本轮只需扩展版本范围、更新开发依赖并重新构建交付，不需要改写插件逻辑。

## 插件版本

| 插件 | 上一版 | 本轮版本 |
| --- | --- | --- |
| DeepSeek Security | 0.1.2 | 0.1.3 |
| DSHGit | 0.1.4 | 0.1.5 |
| DSHKey | 0.1.2 | 0.1.3 |
| RichThinking | 0.1.6 | 0.1.7 |
| MoonSeek | 0.1.1 | 0.1.2 |
| TokenMeter | 0.2.1 | 0.2.2 |

## 修改

- 六个插件的每个 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer 范围末尾加入精确的 `0.2.1-rc.2`，保留原有
  0.2.0-rc.2 / 0.2.1-alpha.2 / 0.2.1-rc.1 范围；Cordis 4.0.5、Schemastery 3.18.5 不变。
- Security、DSHGit、TokenMeter 的开发依赖固定到 `0.2.1-rc.2`，并在干净目录重新解析
  lockfile；DSHKey、RichThinking、MoonSeek 没有 DSH 开发依赖，lockfile 仅随自身版本更新。
- 重新构建六个插件并丢弃仅由 Windows CRLF 造成的构建产物差异；源码逻辑未改。
- RichThinking 的包范围断言、桌面检查脚本、运行时检查脚本与打包输出目录同步到 rc.2。
- 新增本记录；各插件 README 的支持版本与验证链接更新到 rc.2。

没有使用 `--force`、`--legacy-peer-deps` 或版本豁免来绕过兼容检查。

## 验证

在干净安装 rc.2 开发依赖后执行：

| 范围 | 结果 |
| --- | --- |
| DeepSeek Security | build、host/client typecheck 通过；15 项测试通过 |
| DSHGit | build、typecheck 通过；34 项测试通过 |
| DSHKey | build、typecheck 通过；17 项测试通过 |
| RichThinking | build、typecheck 通过；14 项测试通过 |
| MoonSeek | build 通过；2 项测试通过 |
| TokenMeter | build 通过；7 项测试通过 |

合计 89 项插件测试通过。随后使用桌面自带的 Electron、官方
`loadProfileDirectory` / `createRuntimeResolution` / `PluginPackages` 复核：

```powershell
node scripts/check-dsh-desktop.cjs <desktop app.asar/dsh> <desktop profile> receipt.json
node scripts/check-dsh-runtime.mjs <desktop app.asar/dsh/node_modules> <desktop profile>
```

两份结果都显示：

- 运行时为 `0.2.1-rc.2`，`skippedBundles` 为空，Auto Review 保留；
- 六个 Host 入口都能按桌面官方解析导入；
- `cordis` / `schemastery` 单例解析到桌面内嵌副本；
- 六个 `evaluatePluginCompatibility` 全部通过；
- 六个 Client bundle 都以正确包名注册 factory。

本机桌面 profile 已从 `.cache/dsh-0.2.1-rc.2-release/` 安装四个 tgz（DSHGit、RichThinking、
MoonSeek、TokenMeter）；Security 与 DSHKey 继续使用 `link:` 指向仓库源码。安装前配置备份在
`.cache/dsh-rc2-profile-before-20261018/`。读回 profile 的 `skippedBundles` 为空，六个包版本与
上表一致。

## 手动验收

完整退出并重新打开桌面端后，确认插件页不再显示「异常」，再检查：

1. Security：`@deepseek-security` 引用、发起扫描、停止、报告返回。
2. DSHGit：展开面板、差异、暂存与取消暂存；提交/推送/PR 按需要在测试仓库操作。
3. DSHKey：设置页改键与持久化、会话切换、停止及复制动作。
4. RichThinking：状态词轮播、原生鲸鱼与用时、推理折叠和设置保存。
5. MoonSeek：月之亮面/月之暗面、跟随系统及重启后的主题。
6. TokenMeter：真实会话后的计量刷新、重启后历史保留。

自动检查只覆盖兼容门禁、模块导入和 Client 注册，不执行真实模型审计，也不代替桌面视觉与交互验收。
