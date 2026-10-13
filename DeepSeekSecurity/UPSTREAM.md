# 上游来源与适配边界

本插件复用 OpenAI `openai/codex-security` 的审计参考、语义检查点、结果契约、
Python workbench 和报告生成代码。固定源码提交：
`5efc3d9416132c835aba4225a42903c1a7dedf61`。

来源：https://github.com/openai/codex-security/tree/5efc3d9416132c835aba4225a42903c1a7dedf61/plugins/codex-security

`vendor/codex-security/` 保留原路径及 Apache-2.0 许可证。该目录不是完整 SDK 或
Codex 插件发行包，仅包含本适配需要的源码依赖。模型执行、认证、CLI、云端、
MCP App 界面和 Deep Scan 调度器均不作为 DSH 的运行入口。

DSH 接口基线为官方 `d743267388641bc76f17c45ce8b4c231aed1d32c`
（0.2.1-alpha.2），原生组件来自 MIT 许可的 DSH 包；不混入 OpenAI 许可目录。

用户已明确要求使用 DSH 当前模型：原始 Codex 模型运行机制无法同时保留。
适配层只使用 DSH 已有 Agent 生命周期，并采用上游允许的顺序审计降级路径。
这不构成 Codex 模型扫描质量、独立审计或安全验证效果的等价声明。

同步上游时：更新固定提交和 vendor 清单，核对语义草稿、状态字段、报告校验、
引用路径和许可；运行真实 Python workbench 合约测试后再更新 DSH 适配。
不要把上游 CLI 的模拟结果或模型文字中的“完成”当作有效报告。
