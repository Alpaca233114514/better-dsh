# 本机桌面安装记录

2026-10-12：Security 已通过 DSH 桌面专用 `plugin --profile desktop add link:...` 安装到现有 `~/.dsh/profiles/desktop`。保留原有 bundle，包括 `@deepseek-ai/dsh-experimental-auto-review`。

用户要求接入最新 DSH 运行时。官方桌面安装器和更新源当时仍为 `0.2.0-rc.2`，因此独立构建官方 `0.2.1-alpha.2` 桌面源码与 Desktop Host，使用官方 Electron `44.7.0`。**这是本机源码开发构建，不是已签名的新版官方安装器。** 原安装目录没有被替换。

启动入口是本目录 `Start-DSH-Alpha.ps1`；启动后在 DSH 中输入 `@security`，选择 DeepSeek Security。Security 仍然是原生插件，没有自己的应用窗口或服务器。

## 路径

- 新版桌面与 npm 运行时：仓库 `.cache/dsh-desktop-alpha/`
- 固定官方源码：仓库 `.cache/dsh-upstream-20261012/`
- Electron 窗口设置：`%APPDATA%/DeepSeek Harness Alpha`
- 共享 DSH 会话及原生插件 profile：`%USERPROFILE%/.dsh`
- 安装前的 profile 配置备份：仓库 `.cache/dsh-desktop-profile-before-security/`
- 启动日志：仓库 `.cache/dsh-alpha-<timestamp>.*.log`

该入口依赖以上构建目录和原安装器附带的 Office/Python/pnpm 资源；不要把 `.cache/dsh-desktop-alpha` 当作可随意清理的下载缓存。原桌面快捷方式仍对应旧安装器。使用新版入口时，请关闭使用同一 `.dsh` 数据的旧桌面宿主。

## 构建注意事项

`scripts/build-desktop.mjs` 从固定源码构建桌面 main、preload、welcome 和私有 Desktop Host。从仓库根目录运行，依赖已经准备好的独立 desktop package-lock 和 node_modules。它不下载、不安装、不修改原桌面安装目录。

Host 编译必须排除上游 monorepo 的 tsconfig 路径映射（脚本中的 `tsconfigRaw: {}`），保持 `@deepseek-ai/*` 由同一 npm 运行时解析。否则会把 app-boot 状态模块重复打包，导致设置写入无法找到原始 Include entry。浏览器 Welcome 中少量不随 npm 发布的 CSS/组件源码来自同一固定官方提交。

Security 的 Client 文件更新可被页面重新加载看见；Host 代码更新后需要退出并重新启动 DSH。不要把 Client 更新当作 Host 已热重载。
