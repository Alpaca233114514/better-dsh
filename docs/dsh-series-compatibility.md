# DSH 0.2.x 系列兼容

八个插件使用有上下界的 SemVer 范围，不再枚举后续每个 rc。此次替代 PR #10 的精确版本策略：只要宿主仍属于 0.2.x 且不低于插件最低版本，插件不会仅因新版本号被拒绝加载。

| 插件 | 主范围 | 保留的旧版例外 | 插件版本 |
| --- | --- | --- | --- |
| DeepSeek Security | `>=0.2.1-rc.1 <0.3.0-0` | `0.2.0-rc.2`、`0.2.1-alpha.2` | 0.1.5 |
| DSHGit | 同上 | `0.2.1-alpha.2` | 0.1.7 |
| DSHKey | 同上 | `0.2.0-rc.2`、`0.2.1-alpha.2` | 0.1.5 |
| RichThinking | 同上 | `0.2.0-rc.2`、`0.2.1-alpha.2` | 0.1.9 |
| MoonSeek | 同上 | `0.2.1-alpha.2` | 0.1.4 |
| TokenMeter | 同上 | `0.2.0-rc.2`、`0.2.1-alpha.2` | 0.2.4 |
| Qwen | 同上 | 无 | 0.2.2 |
| DSHObserver | `>=0.2.1-rc.2 <0.3.0-0` | 无 | 0.1.2 |

因此 `0.2.1-rc.4`、`0.2.1`、`0.2.2-alpha.1`、`0.2.2`、`0.2.99` 均能通过版本门禁；`0.3.0-alpha.1`、`0.3.0` 和更高系列不匹配。这里的未来版本号是测试输入，不表示这些版本已发布或完成实机验证。

## 规则与维护

[DSH 官方匹配器](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/boot/app-boot/src/plugin-compatibility.ts#L51-L78) 使用 `includePrerelease: true`，因此后续补丁的预发布版本也参与匹配。上界必须写成 `<0.3.0-0`：只写 `<0.3.0` 会把下一个系列的 alpha/rc 也算进来。

统一清单 `scripts/dsh-compatibility.json` 区分 `verifiedRuntime`（已验证宿主基线）和 `seriesUpperExclusive`（系列上界），每个插件保存最低版本及旧版例外。`verifiedRuntime` 不限制兼容范围，0.2.x 更新无需编辑该文件。

`node scripts/sync-dsh-compatibility.mjs --write` 将范围写入每个 DSH peer 和 lockfile 根记录；不带参数只检查一致性。未使用 `engines.dsh` 覆盖 peer、版本豁免、强制安装或第二份宿主。Auto Review 和插件启用状态不变。

## 验证边界

16 项官方门禁测试覆盖八个插件的当前版本、旧版例外、未来同系列 rc/正式版/补丁版、最低版本以下，以及下一系列预发布版/正式版。测试使用真实 `evaluatePluginCompatibility`，不是自写的版本比较器。

当前运行基线仍为桌面 DSH `0.2.1-rc.3`；更新后以官方加载器复验八个 Host 和六个 Client 注册。门禁矩阵证明版本匹配行为，不证明尚未发布宿主的功能；如果同系列内实际发生接口破坏，仍需要针对该变化修复插件。旧范围保留也不代表此次重跑了所有旧宿主功能。

本机安装采用官方 desktop-host CLI，保留 Security、DSHKey、Qwen 的源码链接，更新另外五个本地包。安装前备份位于 `.cache/dsh-series-profile-before-install-20261025/`；安装读回见 [收据](dsh-series-compatibility-receipt.json)。
