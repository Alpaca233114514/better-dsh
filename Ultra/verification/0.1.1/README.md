# 0.1.1 验证记录

2026-11-05（北京时间），DSH 0.2.1-rc.3，配套 thinking-level 0.1.12。

- 11 项策略、投影和目录状态测试通过；旧版持久化记录保留兼容读取。
- `runtime.json`：最终代码在隔离 DSH 中通过原生 `subagent` 工具启动两个子代理，二者实际请求均为 Max。模型工具列表不含 `ultra_subagent`，宿主不再提供自定义 effort 接口。
- `browser.json`：额外代理面板不存在，Ultra/Max 切换、特效、280px 浮层及刷新恢复通过，页面和控制台无异常。
- `installation.json`：记录日常桌面安装、原有依赖/bundle/Auto Review/profile patch 保留情况。

集成验证使用本地脚本模型，不调用外部 DeepSeek 服务，不代表真实任务中的委派频率或效果。截图来自隔离 DSH；日常桌面未发送测试消息、未读取私人聊天。

0.1.0 的活动面板与验证历史保留在 `0.1.0/`，已经从当前插件构建中撤掉。
