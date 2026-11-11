# dsh-pet-manager

DSH 的轻量伙伴插件。Mini 只有快速聊天、语音输入、通知与更多三个入口；伙伴管理和创建放在 **DSH 设置 → 迷你界面和伙伴**，不额外开管理窗口。

## 功能

- 四只原创 SVG 伙伴：云朵、小终端、奶油、滴答；选择「无」只显示 Mini 三键。
- 模板捏宠：羊驼、猫咪、机器人、水滴，支持颜色和配饰；即时预览五种动作。
- SVG 编辑、`.svg` / 宠物 `.json` 导入、JSON 导出、编辑和切换；自定义伙伴可归档并恢复。
- 「让 DSH 设计 SVG」把描述和格式约束写入当前空草稿，由用户发送；将结果粘贴回 SVG 编辑器。随包附带 `skills/hatch-svg-pet/SKILL.md`，不自动安装技能。
- 大小、动画、显示/隐藏与宠物库保存在 DSH 的用户设置中，写入遵守修订检查。主题随 DSH，支持减少动画偏好。
- 应用内可拖动 Mini；可选 Electron 透明置顶桌面窗口，使用私有进程 IPC，不监听额外网络端口。关闭 DSH Web 页面或桥接中断后窗口自动退出。
- 快速聊天聚焦真实 DSH 输入框；语音调用 **DSH 内置语音输入插件的 `remote.speech`**，复用其提供方和语言配置。结束录音后插入原会话草稿，不自动发送；草稿发生变化时保留识别结果供复制。
- 通知只根据真实会话运行变化显示「已停止运行，请查看结果」，不把停止等同于成功。

## 构建和安装

Node.js 24+，需要 DSH 的 Web 插件体系。适配 `settingsScope`（本机 `0.1.0-rc.6`）和 `configForms`（`0.2.1-rc.3` 系列）两种设置接口。跨版本桌面/语音能力以实际安装版本为准。

```powershell
npm --prefix dsh-pet-manager ci --ignore-scripts
npm --prefix dsh-pet-manager run build
npm --prefix dsh-pet-manager test
dsh plugin --profile web add C:\path\better-dsh\dsh-pet-manager --ignore-scripts
dsh web
```

Web profile 已在运行时，需完整重启该进程。安装不会替你开启或下载语音模型；先在 DSH 内启用官方语音输入插件并完成其模型准备。未提供 `remote.speech` 时 Mini 会提示设置需求。

Electron 是可选依赖，`--ignore-scripts` 安装后不会自动下载桌面二进制。需要桌面悬浮时，审阅已安装 Electron 包的 `install.js`，显式运行它，再在本插件设置中开启「跨应用桌面悬浮」。运行中缺少二进制时回退到 DSH 内 Mini，不隐式下载。桌面小窗通过打开着的 DSH 页面执行三键操作，录音使用页面的麦克风权限。

## SVG 格式

使用透明背景和 `viewBox="0 0 128 128"`，最大 100 KB。允许静态 `svg/g/path/circle/ellipse/rect/line/polyline/polygon/title/desc`，以及几何、颜色、透明度、描边、transform 属性；禁止 script、style、事件、外链、image、use、foreignObject、url()、实体和内嵌动画。动画由渲染器统一控制。

```json
{"format":"dsh-svg-pet","version":1,"name":"我的伙伴","description":"一只安静的伙伴","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\">...</svg>"}
```

当前不支持 Codex 位图精灵图包或 Live2D；没有复用 Codex 角色素材。模板生成是本地参数化绘制，DSH 设计入口才使用模型生成 SVG。

## 开发预览和验证

`npm run preview` 在 `http://127.0.0.1:4326` 展示演示数据，不能代替真实 DSH 验收。`scripts/ui-smoke.cjs` 和 `scripts/native-smoke.cjs` 供 Electron 环境验证渲染、交互与原生窗口。常规测试覆盖 SVG 验证、Host 插件注册、修订冲突、语音原会话插入和取消。

许可证和复用范围见 [NOTICE.md](NOTICE.md)。
