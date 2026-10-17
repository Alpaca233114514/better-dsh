// src/index.ts
import z from "@deepseek-ai/schemastery";
var Config = z.object({
  enabled: z.boolean().default(true).description("\u542F\u7528 DSHKey \u6269\u5C55\u5FEB\u6377\u952E").volatile(),
  sameWorkspace: z.boolean().default(true).description("\u4EC5\u5207\u6362\u540C\u4E00\u5DE5\u4F5C\u533A\u7684\u4F1A\u8BDD").volatile(),
  wrapSessions: z.boolean().default(true).description("\u4F1A\u8BDD\u5207\u6362\u5230\u672B\u5C3E\u540E\u5FAA\u73AF").volatile()
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
