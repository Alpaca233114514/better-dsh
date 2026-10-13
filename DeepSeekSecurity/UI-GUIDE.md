# DSH 插件 UI 简明规范

1. **插件引用与用户需求分开。** `@deepseek-security` 是原生引用标签，后面的需求由用户编写。`onPick` 返回 `ReferenceInsert`，不发送消息、不启动扫描，也不替换成整句预设请求。DSH 原生标签已自带 `@`，label 只写插件名称。
2. **发送后由模型调用。** 引用 codec 在发送时加入插件调用说明，DSH 保留标签前后的用户文字。`security_scan.instructions` 携带需求、关注点和排除项，传给实际扫描 Agent。
3. **只在执行期间显示进度。** `conversation.input.dock` 默认渲染为空；宿主出现活动扫描后才显示进度框。没有“就绪”或“开始扫描”面板。结束后收起，报告和失败原因留在原生聊天中。
4. **复用原生组件与主题。** 进度框使用 DisclosureRow、StateDot 和 Button，继承 DSH composer 几何与颜色。提供实际阶段、折叠和停止，避免额外说明小字和专用报告弹窗。
5. **状态来自宿主。** Client 正确解包 `RemoteResult<T>` 的 `ok/value/error`，进度只取真实任务阶段。网络错误不能当作就绪；停止失败不能被下一次成功轮询清除。过期响应不能覆盖取消或已切换的会话。
6. **停止随任务。** 进度框调用宿主取消，聊天停止通过 `exec.signal` 向扫描传递取消。等待执行收尾后才结束工具调用；不能在界面已停时继续消耗模型额度。
7. **生命周期与单例。** Client 先挂载 Typert contribution，再注入 `remote.deepseekSecurity`。轮询与组件一起启动/卸载，注册与样式随 Cordis scope 清理。选择引用、观察进度、查看报告都不能隐式启动模型。

验证重点：插入标签后保留需求、发送才执行、真实阶段驱动进度、完成后隐藏、RPC 错误、重复停止、晚到响应、切换会话及重启恢复。

参考：[Codex Security](https://github.com/openai/codex-security)、[OpenAI 插件技能](https://developers.openai.com/plugins/concepts/skills)。
