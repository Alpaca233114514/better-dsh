# DSH 0.2.1-rc.3 统一兼容交付

2026-10-25，桌面从 rc.2 升到 rc.3 后，八个插件的 DSH peer 范围都没有包含新版本，官方加载器因此拒绝启动。此次保留每个插件已有的旧版范围，为全部八个插件增加 rc.3，并统一检查和打包入口。

## 兼容策略

`scripts/dsh-compatibility.json` 是兼容版本与插件清单的共同来源。运行 `node scripts/sync-dsh-compatibility.mjs --write` 同步全部 DSH peer 与 lockfile 根记录；不带参数时只检查一致性。运行时检查读取目标宿主的真实版本，不再把 rc.2 写死，也涵盖没有 Client 入口的 Qwen 和 Observer。

本次没有把范围放宽到未知版本，也没有添加 `engines.dsh` 覆盖 peer 检查。**未来未验证版本仍会被拒绝**；统一管理消除了漏改插件和检查脚本过期的问题，并不承诺任意未来宿主自动兼容。预发布版本升级须先检查上游差异，再更新清单并验证。旧版范围保留是声明层面的回归保护，不等于此次重新完成了所有旧宿主的功能验收。

源码核对基于官方 [rc.2 → rc.3](https://github.com/deepseek-ai/deepseek-harness/compare/687f282e8625c6b8d11ff58211a90524be2e4317...1f81c047fc48fa190a683e469daa699857e9afe8)。相关核心 LLM、会话、沙箱、快捷键和加载器接口未移除；客户端变化主要新增入口固定和菜单能力，相关原有 slot 保留。插件逻辑无需改变。开发依赖仍使用已锁定的 rc.2 基线，真实 rc.3 加载及专项运行测试另行执行。

## 版本与验证

| 插件 | 交付版本 | 插件测试 |
| --- | --- | --- |
| DeepSeek Security | 0.1.4 | 15 |
| DSHGit | 0.1.6 | 34 |
| DSHKey | 0.1.4 | 17 |
| RichThinking | 0.1.8 | 14 |
| MoonSeek | 0.1.3 | 2 |
| TokenMeter | 0.2.3 | 7 |
| DSHObserver | 0.1.1 | 9 |
| Qwen | 0.2.1 | 15 |

共 113 项插件测试通过；提供 build/typecheck 的插件均通过相应检查。另有 8 项官方兼容门禁测试，覆盖保留版本、rc.3，以及未知版本拒绝。RichThinking 与 MoonSeek 的原生组件测试指定 rc.3 官方源码，无跳过。Security 的工作区边界回归含临时目录 junction；DSHGit 使用本地临时 Git 仓库，未对用户仓库执行提交测试。

通过本机 rc.3 桌面 Electron 及官方解析器完成：

- 隔离 profile 与真实已安装 profile：`skippedBundles` 均为空，八个 Host 成功导入，六个 Client factory 正确注册，Cordis/Schemastery 使用宿主副本。见 [安装读回收据](dsh-0.2.1-rc.3-receipt.json)。
- Qwen：10 项合成运行检查，含真实 Cordis 注册/卸载、UTF-8 流、工具回放、缺失凭据、401 和截断流；HTTP 全部由测试拦截。
- Observer：真实 Cordis/LlmRuntime 的合成流原样传递、会话关联、用量、持久化和卸载；未保存测试正文。
- TokenMeter：真实运行时合成用量增量与峰值均为 26，持久化与两个 RPC schema 通过。

这些验证不等于已完成重启后的桌面视觉交互验收，也不代表真实模型扫描、真实 Qwen 请求或真实请求测速结果。

## 安装与复验

打包命令 `node scripts/pack-dsh-desktop.mjs` 从统一清单生成八个包，输出到 `.cache/dsh-0.2.1-rc.3-release/`。

本机使用桌面自带 `dsh-desktop-host/lib/cli.js` 的 `plugin --profile desktop add ... --ignore-scripts` 更新五个 tgz 安装；Security、DSHKey、Qwen 保留现有 `link:`。普通 CLI 不管理桌面保留 profile。安装前配置备份位于 `.cache/rc3-profile-before-install-20261025/`；会话数据未迁移。安装后确认 bundle 列表和 `cordis.yml`、`cordis.patch.yml`、`compatibility.json`、`pnpm-workspace.yaml` 不变，Qwen 保持禁用，Auto Review 保留。

使用桌面 Electron 的 Node 模式运行：

```text
<electron> --expose-internals scripts/check-dsh-desktop.cjs <app.asar/dsh> <desktop-profile> <receipt.json>
```

仓库增加八插件 CI 矩阵，执行锁文件安装、构建、类型检查、测试及兼容一致性检查。RichThinking/MoonSeek 使用固定 rc.3 源码。CI 不消费模型额度。

首次 CI 暴露 Windows runner 临时目录别名与规范路径不一致：边界测试的相对读取通过，合法绝对读取被拒绝。测试夹具在创建后使用 `realpath` 统一根目录；生产边界实现、所有外部路径及链接拒绝断言均未修改。
