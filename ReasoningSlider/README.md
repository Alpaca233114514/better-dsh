# thinking-level

原生插件 `thinking-level`，当前版本 `0.1.10`，适配并验证 DSH `0.2.1-rc.3`。读取 DSH 已配置的真实模型目录、推理档位和默认设置，通过原生模型选择接口写回；不需要额外 API Key。

`0.1.3` 保持 280px 紧凑浮层和 DeepSeek 品牌蓝；进入 max / ultra / ultracode 时，靛蓝强调色从所选档位点向左展开，只覆盖填充轨道右侧约七成，并显示 13 颗微光粒子。退出该档位即移除效果；减少动态效果时停止展开、漂移和呼吸动画。效果为原创 CSS，不改变模型参数语义。

`0.1.4` 改为离散档位：点击及拖动时立即按最近选项点吸附，中点左侧选左档、右侧选右档，恰好中点选右档；不再产生连续的中间值。视觉保留档位间的缓动，松手提交宿主选择。

`0.1.5` 修复切档闪烁：保存期间不再降低滑条透明度，档位文字复用同一节点、不重复淡入；成功回包后保留预览直到宿主投影更新，失败时回退。已用延迟回包和延迟投影逐帧验证，并覆盖失败回退。

`0.1.6` 加深 Max 的靛蓝渐变，粒子增加至 20 颗（2.2–3.4px），增强光晕和漂移可见度；保持部分轨道覆盖、离散档位和防闪烁处理。

`0.1.7` 将模型选择与推理控制拆成互斥视图：选择模型时收起滑条、档位标题和重置，选完返回；以 320ms cubic-bezier(.22,1,.36,1) 过渡内容高度，隐藏视图 inert，减少动态效果时关闭过渡。当前模型显示勾选标记。

`0.1.8` 更名为 thinking-level；Max 强调色覆盖约 92% 的轨道宽度，从所选档位点向左扩散，左缘仅露少量基础蓝色，保留粒子和离散吸附。旧版配色与命名记录在下文保留为历史。

`0.1.9` 区分打开浮层与切入 Max：已选 Max 重新打开直接显示完成状态，不重放覆盖动画；仅从其他档位切入时使用 850ms cubic-bezier(.22,1,.36,1) 从右向左展开。

`0.1.10` 补充 Max 退出动画：以 420ms cubic-bezier(.4,0,.2,1) 从左向右收回，保持原 Max 点作为终点，结束再移除粒子层；减少动态效果时直接切换。

右上角重置恢复当前模型默认推理档位。没有「快速」模式；不支持推理档位的模型不显示滑条。主题跟随 DSH。

`0.1.1` 把浮层从 `512×195` 收紧到 `344×130`（约 44% 面积）：档位标题 `20px`、模型名 `13px`、轨道和滑钮 `34px`。档位切换改用 `380ms` 的 `cubic-bezier(.25,.8,.25,1)`：拖动时滑钮连续跟随指针，松手后吸附到最近档位，填充条与滑钮沿同一条曲线补间；档位文字、刻度、模型箭头和浮层入场动画共用这组缓动。键盘和重置走同一套动画，`prefers-reduced-motion` 下关闭。

通过目标运行时的官方插件命令安装打包文件：

```powershell
dsh plugin --profile desktop add "C:/path/to/thinking-level-0.1.10.tgz" --ignore-scripts
```

插件包仅包含客户端、空 Host 入口、声明和说明。`debug/` 测试目录、截图和独立 demo 不在安装包中。安装后在 DSH 插件管理页启用；宿主提示需要重启时重启。

2026-11-04 已通过桌面运行时官方 CLI 离线安装到本机日常 `desktop` profile，版本 `0.1.0`；原有 bundle、依赖和 `cordis.patch.yml` 保留，Auto Review 保持启用。配置备份位于仓库 `.cache/reasoning-slider-desktop-backup-20261104`。只读安装验证结果见 `installation-receipt.json`。本机安装包：`release/dsh-reasoning-slider-0.1.0.tgz`。

桌面验收边界：桌面已启动，新建空白会话可见真实模型 DeepSeek-V4.1-Flash Max。后续读取窗口控件被自动审核以可能包含私人聊天为由拒绝，未继续点击滑条、修改真实模型档位或截取桌面验收图；因此安装验证完成，真实模型滑条的最终桌面交互仍待验收。

## 独立外观 Demo

直接用浏览器打开 `demo/index.html`，不需要安装依赖或启动服务。

- 输入框模型按钮打开推理浮层，滑动、点击或方向键调整档位。
- 不提供「快速」模式或闪电按钮。右上角 ↶ 将**当前模型的推理强度**恢复为默认值，不改模型、主题或消息草稿。
- 模型名称可展开演示模型选择；六档、三档、无推理档位三种情况可预览。
- 右上角切换浅色／深色；Escape 或点击浮层外关闭。

`demo/index.html` 是独立 UI demo，模型名称、档位与默认值均为演示数据，刷新会恢复演示初始状态。

## DSH Web 实机调试版（2026-11-04）

本目录另提供 `0.0.1` 原生插件原型，已在本机 DSH **0.2.1-rc.3 Web** 加载验证：

- `src/client.jsx` 通过 `conversation.input.model` 挂载；使用宿主 `modelDirectories` 目录和选择接口，与 `/model` 共用状态。
- 档位、标签和默认值从当前模型的宿主元数据读取；重置恢复该模型的默认推理设置，不改模型与消息草稿。
- 鼠标松开或键盘操作结束后提交，失败信息显示在浮层内。
- `debug/` 是独立的本地测试模型目录，只用于 UI 验证，不执行任何模型推理；不随插件发布。
- 调试目录为仓库 `.cache/reasoning-slider-web`；只链接到这个隔离的 Web profile，未安装到日常桌面 profile。

构建使用仓库已经安装的 MoonSeek/esbuild，无新增依赖：`node ReasoningSlider/scripts/build.mjs`。

本机复现启动（先通过官方 `dsh plugin --profile web add link:绝对路径 --ignore-scripts` 链接本目录，确保环境变量指向独立目录）：

```powershell
$env:DSH_HOME = 'C:/Users/Logan/Documents/GitHub/better-dsh/.cache/reasoning-slider-web'
& 'C:/Users/Logan/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd' --profile web --patch 'C:/Users/Logan/Documents/GitHub/better-dsh/ReasoningSlider/debug/patch.yml' --host 127.0.0.1 --port 5189 --no-open
```

验证通过：六档默认中 → 最高 → 重置中；鼠标拖动到超高；三档默认高 → 低 → 重置高；无推理模型隐藏滑条且禁用重置；重新打开页面后保留已选最高；重置保留未发送草稿。最终新打开的验证页面未捕获控制台 error。修复了接入时遗漏 `remote.session` 依赖、测试目录缺 provider 字段和深色轨道过亮问题。

截图：`demo/web-drag.png`、`demo/web-high.png`、`demo/web-three-reset.png`、`demo/web-no-reasoning.png`、`demo/web-final.png`。这些是 DSH Web 实际页面，不是静态预览。

边界：使用本地测试目录验证了真实宿主选择链路，没有调用外部模型；未验证其他 DSH 版本、正式提供商、断线重连及全部错误分支。本包仍为原型，模型选择菜单尚未补齐原生搜索等完整功能。

## 来源与许可证

`demo/vendor/dsh-theme.css` 复用 DeepSeek Harness `0.2.1-rc.3` 的 `packages/client/ui-theme/src/styles/design-platform.css`，MIT License，Copyright (c) 2026 DeepSeek。完整许可见 `demo/vendor/DSH-LICENSE`。上游：https://github.com/deepseek-ai/deepseek-harness 。其余 demo 代码为本次原创。

实现前已检索 GitHub 同类项目，包括 https://github.com/zhuifengqug/dsh-adaptive-reasoning 与 https://github.com/MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider ；本 demo 未复制这些插件代码。
