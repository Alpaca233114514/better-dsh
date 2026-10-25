# MoonSeek

> 2026-10-25：已适配 DSH **0.2.1-rc.3**，保留原有旧版范围。统一策略、安装版本和验证边界见 [rc.3 兼容记录](../docs/dsh-0.2.1-rc.3.md)。

当前版本支持 **DSH 0.2.1-rc.2**，开发依赖固定到该版本。验证范围见仓库 `docs/dsh-0.2.1-rc.2.md`；以下旧版记录保留为历史证据。

直接修改 DSH「设置 → 通用设置 → 外观」原位置的卡片，不增加独立页面、
侧栏入口或 MoonSeek 标题。权限、语言、字号等仍在同一个设置面板中。

| 模式 | 文案 | 图标 |
| --- | --- | --- |
| `light` | 月之亮面 | 满月 |
| `dark` | 月之暗面 | 弯月 |
| `system` | 跟随系统 | 显示器 |

沿用原生外观卡片的布局、圆角、颜色、悬停和选中状态，补充键盘焦点。
主题切换和持久化直接使用 DSH `theme` 服务；“跟随系统”根据保存的偏好选中，
不因系统当前为深色就选中“月之暗面”。英文界面同步使用月面文案。

## 安装

适配基线：DSH **0.2.1-rc.2 Web 客户端**（包括使用该客户端的桌面 profile）。
源码与构建产物一起交付，无运行时 npm 依赖。将路径改为实际路径：

```powershell
dsh plugin --profile web add "file:C:/path/to/better-dsh/MoonSeek" --ignore-scripts
```

安装后重启目标 DSH profile，再打开「设置 → 通用」。桌面版须使用其附带的
`dsh` 命令并改为 `--profile desktop`，安装前退出桌面，完成后重启。
在插件管理器停用或卸载 MoonSeek 后恢复原生外观行，已有主题偏好保留。

## 开发与验证

```powershell
npm --prefix MoonSeek ci --ignore-scripts
npm --prefix MoonSeek run build
npm --prefix MoonSeek test
npm --prefix MoonSeek run preview
```

预览默认在 `http://127.0.0.1:4178` 将外观卡片放进统一设置面板的布局示例，
保留语言、字号等相邻行，没有 MoonSeek 独立界面。仅供本地 UI 验收，使用模拟服务，
周边设置项为布局示例。原生集成测试读取 `DSH_SOURCE` 指定的上游源码；
默认查找仓库 `.cache/dsh-upstream-20261012`，不存在时会明确跳过该项。

实现通过官方 `settings.general.item` list 插槽的 `appearance` 同名单元与
`priority: -10` 覆盖原生行；卸载后由插槽恢复原生行。其他设置行继续使用原注册。
未修改 DSH 文件、主题配色或用户数据，不另建一套主题偏好。
若另一个插件也覆盖同一单元及优先级，应只启用其中一个。

本地测试和预览不能证明已在用户桌面安装或完成真实 Host 持久化验证。
验证步骤与截图见 [本地验证记录](docs/VERIFICATION.md)。来源与许可见 [NOTICE.md](NOTICE.md)。
