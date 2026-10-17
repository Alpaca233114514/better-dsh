# DSHGit

面向 **DeepSeek Harness 0.2.0-rc.2** 的原生 Git 面板插件。Web 与桌面 Web 客户端共用同一界面；插件不依赖本仓库的其他组件。

会话标题栏的分支图标按钮打开面板：

- **变更卡片**：工作区名称、文件数、增删行数；点击变更查看已暂存和未暂存文件，支持逐文件暂存、取消暂存、文本差异查看。
- **提交与推送**：分支切换、创建功能分支、提交信息、包含未暂存更改选项，以及提交、提交并推送、创建 Pull Request、单独推送四个入口。留空提交信息时，按已暂存文件名生成确定性摘要，不调用模型。
- **Pull Request**：查询当前分支已有的开放 PR 并打开；创建界面包含目标分支、标题、描述和草稿开关。创建前检查当前 HEAD 已推送到 origin。
- **主题一致性**：颜色直接引用 DSH 的 `--dsw-alias-*` 变量，随宿主亮色、暗色和跟随系统设置自动切换；不另存独立主题。独立开发预览使用系统颜色作为后备。
- **快捷键**：提交菜单内 `Ctrl/⌘+Enter` 提交，`Ctrl/⌘+Shift+Enter` 提交并推送；`Esc` 先关闭提交菜单，再关闭面板。入口还提供 HTML `accesskey=g`，具体修饰键由浏览器/操作系统决定。

## 安装

要求 Node.js **24+**、Git，以及 DSH 0.2.0-rc.2。推送沿用宿主的 Git/SSH 凭证；PR 功能另需安装 [GitHub CLI](https://cli.github.com/) 并在宿主上完成 `gh auth login`。当前 PR 支持 `github.com` 的 `origin`，不支持其他托管平台及企业域名。

仓库包含可直接安装的 `lib/` 构建产物。将路径替换为实际绝对路径：

```powershell
dsh plugin --profile web add "link:C:/path/to/better-dsh/DSHGit" --ignore-scripts
```

桌面版请完整退出后，用桌面运行时附带的 `dsh` 命令安装，将 `web` 改为 `desktop`，然后重启。安装完成后在有工作区的会话标题栏打开 **DSHGit**。

## 操作约定

`main/master` 禁止提交、推送和创建 PR；可在提交菜单创建功能分支。插件不提供丢弃文件、强推、改写历史或合并 PR 操作。取消暂存只修改索引，不删除工作区文件。

“包含未暂存的更改”默认勾选，会暂存整个仓库下所有未忽略的新增、修改和删除；取消勾选时只提交现有暂存区。自动消息仅基于文件名，建议重要变更自行填写提交信息。

行数是已跟踪文件暂存区与工作区的 `numstat` 之和；新文件暂存后计入，二进制文件不计文本行数。同一文件在两处有修改时分别计数。上游领先/落后数来自本地远程引用，插件不自动 fetch。

Git 和 gh 通过宿主 `subprocess` 服务以参数数组执行；沿用当前会话 `sandboxPolicy` 与 `sandbox.confine`，不改变权限或自动提升。只读会话禁用写操作，沙箱拒绝直接显示错误。提交失败时保留索引和文件；提交成功但推送失败会明确提示，可单独重试推送。

## 开发与验证

```powershell
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
npm run preview
```

`preview` 仅在 `127.0.0.1:4318` 启动演示数据页面，验证卡片、菜单、PR 表单与亮暗主题，不执行 Git 操作。可通过 `DSHGIT_PREVIEW_PORT` 更换端口。

测试使用独立临时仓库，涵盖真实 Git 状态、差异、暂存、取消暂存、提交与本地 bare remote 推送，以及 React 操作与快捷键。PR 的 gh 调用使用受控替身，不在测试中创建真实 GitHub PR。测试仓库保留在根目录 `.cache/dshgit-*` 便于检查。

源码中 Host 与 Client 的 Typert codec 共用，`lib/` 由构建生成。兼容验证基于 npm 发布的 DSH 0.2.0-rc.2 接口；独立预览和测试不代表已经在用户安装的桌面运行时完成验收。

## 许可

原创实现遵循仓库的 Apache-2.0，见 [LICENSE](LICENSE)。实现前检索了 [dsh-git-nexus](https://github.com/JFWaskin/dsh-git-nexus) 与 DSH 官方插件接口；未复用这些项目的源码。

## 当前桌面兼容版本

本包 `0.1.1-desktop.0` 精确匹配 DSH `0.2.0-rc.2` 与 Cordis `4.0.4`，无需版本风险豁免。使用桌面安装目录 `resources/runtime/cli/bin/dsh.cmd`，不要混用另一版本的全局 dsh。插件配置在下次完整退出并重新启动后生效。打开已存在的工作区会话，在会话标题栏点击 **DSHGit**；空白新会话没有该入口。验证范围见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

GitHub 标识复用自 [Primer Octicons](https://github.com/primer/octicons)，遵循 MIT 许可证；许可全文见 [OCTICONS-LICENSE.txt](docs/OCTICONS-LICENSE.txt)。

工作区干净时，提交菜单仅保留“推送”和“创建 Pull Request”（已有 PR 时为“查看 Pull Request”），隐藏提交信息和包含未暂存更改选项。有未提交更改时显示提交操作；操作执行期间禁止重复触发。
