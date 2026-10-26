# dsh-next-suggestion

为 DeepSeek Harness 提供下一条消息预测。助手回复结束、输入框为空、窗口处于前台时，建议以灰字显示。

- **Tab / → / Enter**：将建议填入可编辑草稿，由你确认发送。
- **Esc**：忽略当前建议。
- **开始输入**：隐藏建议；清空草稿后可以再次显示。

桌面和 Web 提供灰字交互。CLI 提供 `nextSuggestion/getConfig`、`predict`、`updateConfig` 服务接口。

[English](docs/README.en.md) · [架构说明](docs/architecture.md)

## 安装

在仓库目录执行，默认安装到 desktop profile：

```bash
./install.sh
```

安装到其他 profile：

```bash
./install.sh --profile web
```

CLI 管理的 profile 也可以使用官方命令：

```bash
dsh plugin --profile web add .
```

安装后重启 DSH，在「设置 → 通用设置」中启用「显示预测消息」。

默认安装目录为 `~/.dsh/plugins/dsh-next-suggestion`。可通过 `DSH_HOME` 设置数据目录、`DSH_PLUGINS_DIR` 设置插件目录、`DSH_PROFILE` 设置默认 profile。`--profile` 优先于环境变量。

## 配置

在「插件 → 预测消息 → 配置」中修改，也可以编辑 profile 的 `cordis.patch.yml`。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `cacheTtlMs` | `1800000` | 缓存时长，单位毫秒 |
| `cacheMaxEntries` | `200` | 缓存会话数上限，修改后重载插件 |
| `preferredReasoningEffort` | `high` | 模型推理档位 |
| `fallbackPollMs` | `30000` | 缺少会话状态钩子时的轮询间隔，单位毫秒，修改后重启 DSH |

## 更新与卸载

更新源码后重新执行对应 profile 的安装命令。卸载示例：

```bash
./uninstall.sh --profile web
```

卸载会移除该 profile 的登记与链接。共享副本保留到最后一个使用它的 profile 卸载，源码目录始终保留。

## 模型与日志

预测使用会话或 profile 配置的模型服务，并产生相应的模型调用费用。上下文最多包含 40 条消息、24,000 字符，每条最多 4,000 字符。

排错时可启用日志：

```bash
touch "${DSH_HOME:-$HOME/.dsh}/next-suggestion-debug"
tail -f "${DSH_HOME:-$HOME/.dsh}/logs/next-suggestion.log"
```

日志可能包含对话文本，文件权限为 `0600`。排错后关闭：

```bash
rm "${DSH_HOME:-$HOME/.dsh}/next-suggestion-debug"
```

## 开发

```bash
npm ci
npm test
```

测试覆盖预测、交互、配置和多 profile 安装，使用模拟模型流。

提示词位于 [lib/prompt.js](lib/prompt.js) 的 `SYSTEM_PROMPT`。模型请求与上下文组装入口位于 [lib/prediction.js](lib/prediction.js)。

MIT
