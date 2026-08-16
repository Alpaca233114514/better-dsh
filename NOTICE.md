# NOTICE 著作权与第三方声明

本文件用于说明 better-dsh 仓库中收录内容的著作权归属与许可证信息，
遵循 Apache License 2.0 第 4 条 (d) 款的要求，保留第三方作品的著作权声明。

## 本仓库原创内容

- `TokenMeter/`（Token 计量插件）与 `BetterManager/`（Better Manager 插件管理器）
  为本仓库原创的 DeepSeek Harness 动态 Cordis 插件，遵循仓库根目录
  [LICENSE](LICENSE)（Apache License 2.0）。

## 第三方收录：dsh-anchored-standard

- **项目名称**：dsh-anchored-standard — 双阶段 DeepSeek Harness 代理 preset
  （首轮锚定 Minimal 条件，会话持久后晋升到小型 resident 工具目录）
- **来源仓库**：<https://github.com/xiaobright/dsh-anchored-standard>
- **收录版本**：`main` 分支 commit `0a38616c1b7ce4219b6d94d95c89f34a90741616`（2026-08-16）
- **收录方式**：原样复制源码至 `dsh-anchored-standard/` 目录（不含 `.git`），未做任何修改
- **许可证**：MIT License
- **著作权**：Copyright (c) 2026 xiaobright；Portions Copyright (c) 2026 DeepSeek

  ```
  MIT License

  Copyright (c) 2026 xiaobright
  Portions Copyright (c) 2026 DeepSeek

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  ```

- 完整许可证文本见 [`dsh-anchored-standard/LICENSE`](dsh-anchored-standard/LICENSE)。
- 该 preset 的 `preset/agent.cordis.yml` 派生自 DeepSeek Harness Standard preset，
  上游已保留 DeepSeek 的 MIT 著作权声明，见
  [`dsh-anchored-standard/NOTICE`](dsh-anchored-standard/NOTICE)。
- 这是社区项目，并非 DeepSeek 官方 preset，也不代表 DeepSeek 的认可或背书。
  （DeepSeek 与 DeepSeek Harness 为其所有者名称。）

## 第三方收录：Oi

- **项目名称**：Oi — 面向 Agent Skills 的 agent-native 语言
- **来源仓库**：<https://github.com/oi-language/oi>
- **收录版本**：`master` 分支 commit `f8e9606644a65d642adf91a8dabf679f918a6f8c`（tags `0.0.1` / `0.0.2` 之后的最新提交）
- **收录方式**：原样复制源码至 `Oi/` 目录（不含 `.git`），未做任何修改
- **许可证**：MIT License
- **著作权**：Copyright (c) 2026 Oi contributors

  ```
  MIT License

  Copyright (c) 2026 Oi contributors

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  ```

- 完整许可证文本见 [`Oi/LICENSE`](Oi/LICENSE)。
- Oi 项目名、logo 与吉祥物为其品牌资产，MIT 许可证不授予商标权。

### DSH 技能接线（`.agents/skills/`）

仓库根目录 [`.agents/skills/`](.agents/skills/) 下另存了一份 Oi 的 7 个技能
（`using-oi`、`compile-oi`、`format-oi`、`debug-oi`、`bench-oi`、`convert-oi`、
`upgrade-oi`）的完整副本，供 DSH 自动扫描（DSH 只发现一层深的
`<技能根>/<name>/SKILL.md`，而 Oi 技能位于 `Oi/plugins/oi/skills/` 深层目录，
默认不会被发现）。这些副本同样遵循 Oi 的 MIT License 与上述著作权声明。

**升级 Oi 时**：覆盖 `Oi/` 后，请同步把 `Oi/plugins/oi/skills/` 下的 7 个技能目录
重新复制到 `.agents/skills/`，保持两份内容一致。

## 更新第三方收录

如需升级 `Oi/` 或 `dsh-anchored-standard/` 目录内容，请从上游仓库重新复制，
并同步更新本文件中对应的收录版本（commit hash）与日期。
`dsh-anchored-standard/` 升级时请一并核对上游 [`NOTICE`](dsh-anchored-standard/NOTICE)
中 DeepSeek Harness 派生内容的著作权声明是否变化。
