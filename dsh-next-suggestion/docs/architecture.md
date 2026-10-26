# 架构

## 模块

| 文件 | 职责 |
| --- | --- |
| `index.js` | 注册预测服务、HTTP 路由和配置接口 |
| `client.js` | 灰字、键盘交互、开关与配置表单 |
| `lib/prompt.js` | `SYSTEM_PROMPT` 提示词、上下文截取和结果过滤 |
| `lib/prediction.js` | 回合判断、模型调用和缓存调度 |
| `lib/cache.js` | 缓存有效期与容量管理 |
| `lib/settings.js`、`lib/config-schema.js` | 配置默认值、校验与 Loader schema |
| `lib/typert.host.js` | CLI 服务调用声明 |
| `lib/http.js`、`lib/diagnostics.js` | HTTP 数据处理与诊断日志 |

Host 依赖 `sessions`，Web 服务就绪后注册 `/next-suggestion/api`。HTTP 和 typert 共用预测与配置实现。HTTP 请求先经过 DSH Connection 的准入检查。

`client.js` 由宿主作为单文件模块加载，React 通过模块工厂注入。

## 预测流程

1. 从会话日志确认最新回合正常结束。
2. 截取用户消息与助手文本，选择会话模型或 profile 默认模型。
3. 查找缓存，同一会话的相同请求复用正在执行的任务。
4. 调用模型并组装响应，每次调用限时 45 秒。
5. 过滤复读、助手腔和超过 240 字符的结果。
6. 确认回合仍然有效后返回并缓存建议。

缓存键包含完成事件序号、上下文、模型路由和推理档位。默认保留 30 分钟，空结果保留 2 分钟。

## 客户端

输入框为空、窗口聚焦且会话空闲时展示建议。附件、提交过程和输入法组合输入会隐藏建议。预测状态按会话隔离，新回合开始时清除旧结果。

接受建议通过宿主的 `inputActions.setDraft` 写入草稿。支持 `useSession` 的宿主按回合结束触发请求，其他宿主使用配置的轮询间隔。窗口重新聚焦时读取缓存。

## 配置与安装

配置保存在 profile 的 `cordis.patch.yml`，表单通过 settings 服务逐字段保存。缓存容量在插件启动时读取，轮询间隔在客户端初始化时读取。

安装脚本按白名单复制运行文件、文档和安装脚本，再链接到目标 profile。共享副本在最后一个 profile 卸载后清理，源码目录保留。

诊断开关位于 DSH 数据目录的 `next-suggestion-debug`，日志位于 `logs/next-suggestion.log`，文件权限为 `0600`。

## 测试

`npm test` 覆盖纯函数、客户端交互、Host 服务、日志权限和多 profile 安装。模型响应使用测试桩，桌面布局与真实模型效果通过宿主验收。
