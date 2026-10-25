# DSHObserver

> 2026-10-25：已适配 DSH **0.2.1-rc.3**，保留原有旧版范围。统一策略、安装版本和验证边界见 [rc.3 兼容记录](../docs/dsh-0.2.1-rc.3.md)。

面向 **DSH 0.2.1-rc.2** 的逐次模型请求观察器，用于研究上下文、缓存、思考强度、并发与输出速度的关系。独立于 TokenMeter，不改变模型请求或生成参数，不额外调用模型。Host 插件，无前端构建或新增安装依赖；官方 `dsh-llm` 由 DSH 运行时提供。

## 安装与观察

在仓库根目录运行，`dsh` 必须来自目标 DSH 运行时：

```powershell
# 桌面 profile：先在方便的时候完整退出 DSH，安装后重新打开
dsh plugin --profile desktop add "link:C:/Users/Logan/Documents/GitHub/better-dsh/DSHObserver" --ignore-scripts

# 也可用于 Web profile，将 desktop 改为 web
# 使用 Node.js >=24，在另一个终端观察新动作
node DSHObserver/cli.mjs watch

# 导出已采集数据；输出目录必须尚不存在
node DSHObserver/cli.mjs analyze --out .cache/dsh-observer-report-001
```

数据默认保存在 `$DSH_HOME/state/dsh-observer/`，未设置 `DSH_HOME` 时为 `~/.dsh/state/dsh-observer/`。每次插件加载使用新的 `run-*.jsonl` 文件，保留旧数据。多实例不共享文件。终端与 DSH 使用不同 `DSH_HOME` 时，明确传入数据路径：

```powershell
node DSHObserver/cli.mjs watch --input "C:/path/to/DSH_HOME/state/dsh-observer"
node DSHObserver/cli.mjs analyze --input "C:/path/to/run-example.jsonl" --out .cache/report-002
```

`watch` 从现有文件末尾开始，按约一秒刷新请求开始/完成、重试和工具结果；**Ctrl+C 只结束终端观察，插件仍继续采集**。要停止采集，在 DSH 原生插件管理器禁用本插件。安装本插件不会自动运行分析或创建定时任务。

## 采集字段与口径

每次 `llm/stream` 对应一次 provider attempt。重试单独产生新请求行，失败行保留。通过官方 `isAgentLoopRequest` 识别真正的会话请求；标题、压缩及其他辅助调用分组保存，避免同一 session 的辅助调用借用会话 turn/step。

| 类别 | 字段/说明 |
| --- | --- |
| 关联与参数 | callId、sessionId、turn、step、attempt、provider、model、purpose、reasoningEffort、temperature、maxTokens、stopCount |
| 上下文 token | contextTokens = inputTokens + cacheReadTokens + cacheWriteTokens；提供方实际 usage，结束时才可用；未报告为 null |
| 缓存与容量 | 三种输入 token 分桶、cacheHitRatio、contextWindow、contextOccupancy；容量仅采用当前路由 `request/context` 事件，未观察到时留空 |
| 请求规模 | 消息总数及角色数、messageJsonBytes、systemBytes、textChars、historyReasoningChars、工具声明数与字节数、图片/文件/历史工具调用数 |
| 输出 | outputTokens、reasoningTokens、正文/推理/工具参数字符数、生成的工具调用数；推理 token 已包含在 outputTokens 中 |
| 等待与速度 | ttftMs、firstTextMs、decodeMs、decodeTps、elapsedMs、endToEndTps、streamLifetimeMs |
| 流与停顿 | chunkCount、contentChunks、contentSpanMs、gapMeanMs、gapMaxMs、gapP50UpperMs、gapP95UpperMs、gapsOver1s |
| 客户端与并发 | consumerWaitMs/MaxMs（yield 至消费者请求下一块的时间）、activeAtStart、maxConcurrent、observerSetupMs（采集初始化计数耗时）；当前进程范围的 CPU 时间、ELU、RSS |
| 故障 | status、failureCode、httpStatus、retriesBefore；独立 retry 事件含计划 delayMs，retry-started 事件提供实际等待结束边界 |
| 工具动作 | tool-start/tool-end，callId、toolName、参数/结果字节数、isError、callToResultMs（包含调度等待的调用至结果时间） |

`decodeTps = outputTokens / ((finish 到达时间 - 首个非空正文/推理/工具增量到达时间) / 1000)`。
`endToEndTps` 包含本次 attempt 首 token 前的等待。首 token 是客户端观察到的首个有效增量，并不代表网络层首字节。所有耗时使用单调时钟；绝对时间使用 UTC Unix 毫秒，终端按北京时间显示。

输出速度在请求结束、usage 可用时计算；流中的 chunk/字符不能换算成精确 token。缺少 usage、没有内容、没有 finish 或零生成时长时，TPS 为 null。失败和中断即使收到 usage，也不会混入默认成功样本分析。流停顿包含客户端下游处理时间；不能据此声称测得服务端纯解码速度。gap 百分位是固定 log2 桶的上界估计，最后一桶饱和后不再保证上界，精确最大值另存。

`messageJsonBytes` 和 `toolSchemaBytes` 是 DSH 请求对象的 UTF-8 JSON 规模；适配器还会投影图片、文件、工具历史或加入协议包装，**这不是实际 HTTP 请求字节数或 tokenizer 估算**。不会为了测量额外执行 tokenizer 或网络探测。

## 导出与研究

`analyze` 导出四个文件：

- `requests.csv`：每个完成 attempt 一行，含成功、失败和取消，可用 Excel、Python、R 分析。
- `events.csv`：重试、工具和采集器生命周期事件，保留 session/turn/step 便于关联。
- `summary.json`：机器可读分组、上下文分桶和 Pearson 相关系数。
- `report.md`：可读报告，按 provider/model/reasoningEffort/purpose 分组，8,192 token 一个上下文区间。

每组分别分析 contextTokens、缓存命中率、输出/推理 token、请求规模、工具规模、并发、进程负载、流停顿与 TPS 的相关性。有效成对样本少于 3 或变量恒定时不计算系数；统计值不代表显著性或因果。输出长度、时段、会话重复采样和并发均会混杂。建议同模型同强度下逐步增加上下文，分开比较单并发/多并发、缓存冷/热，保留失败率和 TTFT，不只比较 TPS。gap/consumerWait 与 TPS 共享时间项，其相关性含数学耦合。

## 数据与运行边界

不保存 system/prompt/reasoning/正文、工具参数/结果正文、schema 内容、HTTP headers、URL、凭证或错误 message。只保留计数与必要标识，provider/model/toolName 是用户或插件定义的名称，导出前可按研究需求匿名化。CSV 对可触发电子表格公式的字符串加单引号，原 JSONL 不改值。

采集数据写在插件私有状态目录，与 Agent 工作区读写权限无关。每 250 ms 批量追加，不在流传递中等待磁盘。队列上限 10,000 条；溢出或磁盘错误时 DSH 日志告警/JSONL `data-loss` 标记，不阻断模型流。异常退出可能留下 start 而没有 end；报告统计未结束请求，不能当成成功。禁用时刷新待写队列；停止采集后的在途请求不再补记 end。

不采集网络 RTT、服务端排队/GPU 负载、UI 绘制延迟或真实 wire 协议。CPU/ELU/RSS 属于整个 DSH 进程，共享并发时不能分摊到单次请求。采集自身也有开销，超大上下文的 JSON 计数可能增加开始等待，比较性能时应保留这一限制。

## 验证

```powershell
npm --prefix DSHObserver test
```

本地确定性测试覆盖计时、重试、辅助调用隔离、缓存计数、缺失用量、并发、消费者等待、取消/异常/提前关闭、工具关联、正文不落盘、持久化故障、相关计算和导出。`test/runtime-smoke.mjs` 可由目标桌面 Electron 的 Node 模式执行，以真实 Cordis/LlmRuntime 加载插件并通过模拟 adapter 验证；不消费模型额度。

2026-10-21 验证结果：9 项测试通过；桌面内嵌 DSH 0.2.1-rc.2 的兼容检查、真实插件加载、模拟流原样传递、会话关联、token 计数、持久化和卸载刷新通过。模拟数据的四文件导出已执行检查，不能据其速度值推断真实模型表现。

未安装到日常桌面 profile、未做真实模型采样与桌面 UI 验收。支持范围只声明已核对的 rc.2，升级 DSH 后需要重新核对事件和用量语义。

## 接口参考

开发前已检查 GitHub 上现有 token 统计插件，并核对 [DSH 官方流接口](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/llm/llm/src/types.ts)、[请求身份](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/llm/llm/src/call-config.ts)、[会话事件](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/session/src/types.ts)。本插件为独立实现，没有复制第三方插件代码。
