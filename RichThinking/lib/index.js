// src/index.ts
import z from "@deepseek-ai/schemastery";
var Config = z.object({
  enabled: z.boolean().default(true).description("Enable Rich Thinking / \u542F\u7528\u4E30\u5BCC\u601D\u8003").volatile(),
  language: z.union(["zh", "en"]).default("zh").description("\u72B6\u6001\u8BCD\u8BED\u8A00 / Status language").volatile(),
  vocabularyMode: z.union(["append", "replace"]).default("append").description("Custom vocabulary mode / \u81EA\u5B9A\u4E49\u8BCD\u5E93\u6A21\u5F0F").volatile(),
  englishVerbs: z.array(z.string()).default([]).description("Custom English phrases / \u81EA\u5B9A\u4E49\u82F1\u6587\u8BCD\u5E93").volatile(),
  chineseVerbs: z.array(z.string()).default([]).description("Custom Chinese phrases / \u81EA\u5B9A\u4E49\u4E2D\u6587\u8BCD\u5E93").volatile(),
  intervalMs: z.number().min(2e3).max(6e4).step(1).default(5e3).description("Switch interval in ms / \u5207\u6362\u95F4\u9694\uFF08\u6BEB\u79D2\uFF09").volatile(),
  animation: z.boolean().default(true).description("Gentle transitions / \u8F7B\u5FAE\u8FC7\u6E21\u52A8\u753B").volatile(),
  showElapsed: z.boolean().default(true).description("Show observed live duration / \u663E\u793A\u672C\u6B21\u53EF\u89C1\u63A8\u7406\u8BA1\u65F6").volatile()
});
function apply(ctx) {
  ctx.inject(["settings"], (child) => {
    child.effect(() => child.settings.configure({ auto: true }, ctx.fiber));
  });
}
export {
  Config,
  apply
};
