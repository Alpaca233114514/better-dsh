# 桌面适配与验证

2026-10-17，目标为桌面快捷方式 `DeepSeek Harness.lnk` 指向的已安装应用，版本 **0.2.0-rc.2**。Electron 读取安装包内 manifest 也确认 `cordis 4.0.4`、`dsh-typert-protocol 0.2.0-rc.2`、`dsh-llm 0.2.0-rc.2`。仓库另一个 `.cache/dsh-desktop-alpha` 是独立开发运行时，不能代替正式桌面验证。

原生包名 `dsh-token-meter-dashboard`，版本 `0.2.0`；避免与官方 `@deepseek-ai/dsh-token-meter` 的上下文用量服务重名。Host 服务和 RPC namespace 为 `tokenMeterDashboard`，通过原生 Typert schema 传输；Client 注册现有 `settings.section`。

已执行正式桌面内嵌 Electron / Node、Cordis 与 Typert 的 Host 加载和合成 usage 检查：输入 5、缓存读取 7、缓存写入 3、输出 11，累计增量 26、单轮峰值 26、两个 RPC schema 校验和私有目录落盘通过。合成检查使用仓库 `.cache/token-meter-smoke-home`，不写日常计量数据，不消费模型额度。

同一脚本也通过独立 `0.2.1-alpha.2` 运行时检查。可用 `scripts/runtime-smoke.cjs <运行时 node_modules> <隔离测试 DSH_HOME>` 重现；正式桌面要用其附带 Electron，设置 `ELECTRON_RUN_AS_NODE=1` 并传入 `--expose-internals`，运行时模块目录位于 `resources/app.asar/dsh/node_modules`。

回归测试覆盖旧数据保留、晚出现会话的数据发现、全局事件订阅、失败流保留已报告 usage、最终 usage 样本、损坏文件保护、保存失败反馈和并发保存期间的新用量。

本轮共通过 18 项测试（TokenMeter 7 项与仓库动态插件回归 11 项），`git diff --check` 通过。已使用正式桌面自带 CLI 将 `0.2.0-desktop.1` 安装到 `~/.dsh/profiles/desktop`，安装后读回 package manifest 和 profile bundles 确认成功，原有 Auto Review bundle 保留。安装前 profile 配置备份在仓库 `.cache/token-meter-profile-before-20261017/`。包管理器提示既有 peer 警告，不能把安装成功当作全部日常插件兼容性证明。

这些证据验证了运行时接口和计量逻辑；不等同于日常桌面窗口中的真实模型计费核对。历史聚合文件不能补回原来漏记的缓存用量，也不能证明提供商账单一致。
