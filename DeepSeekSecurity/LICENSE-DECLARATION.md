# DeepSeek Security 许可证与来源声明

## Codex Security

本插件复用了 OpenAI 发布的 [Codex Security](https://github.com/openai/codex-security) 的部分开源代码与审计资料。

- 上游作者：OpenAI。
- 上游版权声明：`Copyright 2025 OpenAI`。
- 固定源码提交：`5efc3d9416132c835aba4225a42903c1a7dedf61`。
- 上游插件目录：[plugins/codex-security](https://github.com/openai/codex-security/tree/5efc3d9416132c835aba4225a42903c1a7dedf61/plugins/codex-security)。
- 许可证：Apache License, Version 2.0（Apache-2.0）。[上游许可证](https://github.com/openai/codex-security/blob/5efc3d9416132c835aba4225a42903c1a7dedf61/LICENSE)全文保留于本插件的 [vendor/codex-security/LICENSE](vendor/codex-security/LICENSE)。

复用内容位于 `vendor/codex-security/`，包括审计参考资料、语义草稿与结果契约、Python workbench 及报告生成代码。所选文件见 [FILES.json](vendor/codex-security/FILES.json)，适配范围见 [UPSTREAM.md](UPSTREAM.md)。上游文件保留原目录结构、版权和许可证；本项目不将这些内容声明为原创。

## DSH 适配与其他来源

本项目新增的 DSH 适配代码位于 `src/`，采用 [Apache-2.0](LICENSE)。模型执行、会话工具、配置与界面接入由 DSH 原生接口提供，与上述上游代码分别维护。

DSH API、原生 UI 组件及布局参考来自 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c)，版权声明为 `Copyright (c) 2026 DeepSeek`，采用 MIT License；许可证全文保留于 [DSH-LICENSE](DSH-LICENSE)。

## 分发说明

分发本插件时，应随附相应的许可证全文及版权、来源声明。对上游文件的后续修改应作出明确标记；各部分的使用与分发条件以相应许可证原文为准。

本插件是社区 DSH 适配项目，不是 OpenAI 或 DeepSeek 官方发行或背书的产品。第三方声明另见 [NOTICE.md](NOTICE.md)。
