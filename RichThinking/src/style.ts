// All rules scoped to adapter-owned markers; no theme, root, button or Markdown resets.
export const css = `
/* One visible label: suppress the entire native shimmer subtree, including copies.
   The whale and accessible status are separate siblings and remain native. */
[data-chat-running][data-rich-thinking] [data-rich-thinking-native] { display:none !important; }
/* ConfigField's select/textarea are not public exports in either supported DSH
   version. Match their tokens and geometry; keep Switch/Input/Button native. */
[data-rich-thinking-settings] { display:flex; flex-direction:column; min-width:0; color:var(--dsw-alias-label-primary); }
[data-rich-thinking-settings] [data-rt-setting-field] { display:flex; flex-direction:column; gap:6px; min-width:0; padding:12px 0; }
[data-rich-thinking-settings] [data-rt-setting-field] + [data-rt-setting-field] { border-top:0.5px solid var(--dsw-alias-border-l2); }
[data-rich-thinking-settings] [data-rt-setting-row] { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:32px; }
[data-rich-thinking-settings] [data-rt-setting-actions] { display:flex; flex-wrap:wrap; gap:8px; padding-top:16px; }
[data-rich-thinking-settings] :is(select,textarea) { box-sizing:border-box; width:100%; min-width:0; font:inherit; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-3); border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); padding:6px 12px; }
[data-rich-thinking-settings] :is(select,textarea):focus-visible { outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset:1px; }
[data-rich-thinking-settings] :is(select,textarea):disabled { opacity:0.4; cursor:default; }
[data-rich-thinking-settings] textarea { resize:vertical; line-height:1.5; }
[data-rich-thinking-settings] label, [data-rich-thinking-settings] [data-rt-setting-row] > span { font-size:13px; font-weight:500; }
[data-rich-thinking-settings] [role="status"] { margin:12px 0 0; color:var(--dsw-alias-label-secondary); font-size:13px; overflow-wrap:anywhere; }
[data-rich-thinking-host] {
  display:inline-flex; flex:0 1 auto; min-width:0; max-width:100%;
  font:inherit; color:inherit;
}
[data-rich-thinking-label] {
  display:inline-flex; align-items:center; min-width:0; max-width:100%;
}
[data-rich-thinking-word] {
  display:inline-block; min-width:0; max-width:23ch; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap;
}
[data-rich-thinking-label][lang="zh"] [data-rich-thinking-word] { max-width:9em; }
[data-rich-thinking-elapsed] { font-variant-numeric:tabular-nums; flex-shrink:0; white-space:pre; }
`
