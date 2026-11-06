# DSH 0.2.2-rc.1 兼容验证

2026-11-06，北京时间。安装包：`dsh-ultra 0.1.3`、`thinking-level 0.1.13`。

- DSH 自带的兼容检查器确认两个包支持 `0.2.1-rc.3` 和 `0.2.2-rc.1`；旧声明在新宿主上被拒绝，未验证的 `0.2.2-rc.2` 仍被拒绝。见 `compatibility.json`。
- 11 项原有策略、投影及状态测试通过。
- 使用已安装桌面版的官方 CLI，在独立 profile 中运行本地脚本模型。宿主加载、原生子代理、Max 参数、模式流与退出 Ultra 均通过。见 `runtime.json`。
- 真实 DSH Web 界面中的 Ultra/Max 切换、特效、280px 浮层及刷新恢复通过，页面及控制台无错误。见 `browser.json` 和截图。
- 官方 CLI 已更新日常 desktop profile；安装文件与发布包逐字节一致，其他依赖、bundles、Auto Review、profile patch 和兼容豁免文件保留。见 `installation.json`。

这些测试不使用外部模型，不证明真实 DeepSeek 的委派质量。本轮期间另有 Ultra 源码修改，已保留，未纳入这次通过验证的兼容安装包。用户要求停止电脑控制并自行完成桌面重启与验收，因此日常桌面重新加载后的状态未验证。
