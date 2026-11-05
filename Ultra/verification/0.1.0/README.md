# 0.1.0 验证记录

日期：2026-11-05（北京时间）。配套滑条：thinking-level 0.1.12；原生运行时：DSH 0.2.1-rc.3。

- 11 项策略、投影与客户端状态测试通过，覆盖虚拟 Ultra 的 Max 映射、失败回退、旧响应、分支隔离、能力缺失和其他提供方的真实 Ultra 档。
- `runtime.json`：在独立 DSH_HOME 中加载最终安装包，使用脚本适配器驱动原生 AgentLoop、工具管道和 spawn 子代理。验证默认 Max、显式 High，以及修改为 Medium 后继续同一子代理的真实请求。标题生成是宿主辅助调用，保留原有 Low 设置，不算主代理/子代理推理。
- `browser.json`：在同一原生 Web 前端验证旧会话恢复、Ultra/Max 切换、特效唯一归属、280px 浮层、子代理 effort RPC、全部恢复 Max 和重载。页面异常与控制台错误均为空。
- `installation.json`：通过桌面附带 CLI 安装到日常 desktop profile。已核对已装代码与源码一致、其他依赖及 bundle 保留、Auto Review 保留、原有 profile patch 未变、测试夹具未进入安装包；桌面已重开并确认主窗口存在。
- 包管理器 peer 检查提示来自原有 dshgit、dsh-observer 等插件对宿主共享依赖的声明，没有指向本次新增的两个包；未为消除提示修改或安装额外依赖。

截图 `native-ultra-final.png` 来自隔离 DSH 的真实前端与测试会话。测试适配器不调用外部模型；这些结果不证明 DeepSeek 在真实任务中的主动委派频率或质量提升。日常桌面未发送测试消息，也未读取私人聊天进行验收。

原始 Demo 和历史测试构建保留；早期测试包已移至仓库 `.cache/ultra-builds/`，正式安装包以 README 中的版本目录为准。
