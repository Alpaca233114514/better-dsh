# 来源与许可

`vendor/dsh-audio.ts` 复用 DeepSeek Harness 官方语音输入插件的录音与 WAV 转换代码（MIT，Copyright (c) 2026 DeepSeek）。来源：
https://github.com/deepseek-ai/deepseek-harness/tree/v0.2.1-rc.3/packages/experimental/client-ui-voice-input/src/client/audio.ts
随附完整许可证 `vendor/LICENSE.deepseek`。其余新增代码和内置 SVG 按本仓库 Apache-2.0 许可分发。

Mini 三入口与设置卡片布局以用户提供的 Codex 截图和需求为交互参考，没有复制 Codex 私有代码或宠物素材。
开发前调研了 AsahiMoon/dsh-desktop-pet（MIT）的桌面窗口与插件结构；本插件未复制该项目代码或角色素材。

运行时依赖 React（MIT）、Electron（MIT）、Zod（MIT）及 DeepSeek 开源包，许可证以各包随附文本为准。
