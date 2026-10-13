// All rules scoped to adapter-owned markers; no theme, root, button or Markdown resets.
export const css = `
[data-rich-thinking] [data-rich-thinking-title] {
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip-path:inset(50%); white-space:nowrap;
}
/* Native decorative text remains React-owned. Suppress its duplicate title/preview
   overlay while the plugin presents a label; the real preview is still visible. */
[data-rich-thinking] [data-disclosure-row] > [data-shimmer] > [aria-hidden="true"] { display:none; }
[data-rich-thinking] > div > button[data-process-activity] > [data-shimmer] > [aria-hidden="true"] { display:none; }
[data-rich-thinking-settings] { display:flex; flex-direction:column; gap:10px; max-width:560px; padding:8px 0; }
[data-rich-thinking-settings] [data-rt-setting-row] { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:32px; }
[data-rich-thinking-settings] [data-rt-setting-actions] { display:flex; gap:8px; margin-top:6px; }
[data-rich-thinking-settings] :is(select,textarea) { font:inherit; color:inherit; background:var(--dsw-alias-bg-base,transparent); border:1px solid var(--dsw-alias-border-primary,currentColor); border-radius:8px; padding:8px 10px; }
[data-rich-thinking-settings] textarea { resize:vertical; }
[data-rich-thinking-settings] label { margin-top:4px; }
[data-rich-thinking-host] {
  display:inline-flex; flex:0 1 auto; min-width:0; max-width:100%;
  font-size:var(--dsh-content-font-size-secondary,13px);
  line-height:calc(24px + var(--dsh-content-font-delta,0px)); color:inherit;
}
[data-rich-thinking-label] {
  display:inline-flex; align-items:center; gap:8px; min-width:0; max-width:100%;
}
[data-rich-thinking-word] {
  display:inline-block; width:23ch; max-width:100%; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap;
}
[data-rich-thinking-label][lang="zh"] [data-rich-thinking-word] { width:9em; }
[data-rich-thinking-elapsed] { font-variant-numeric:tabular-nums; min-width:4ch; text-align:right; }
[data-rich-thinking-label][data-motion="on"] [data-rich-thinking-word] { animation:dsh-rich-thinking-enter 160ms ease-out; }
@keyframes dsh-rich-thinking-enter { from { opacity:.55; } to { opacity:1; } }
@media (prefers-reduced-motion:reduce) {
  [data-rich-thinking-label] [data-rich-thinking-word] { animation:none !important; }
}
`
