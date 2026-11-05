window.__ModuleLoader__.load({id:"thinking-level",factory(require){const module={exports:{}};const exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ReasoningSlider/src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// ReasoningSlider/src/style.css
var style_default = "/* DSH \u63A8\u7406\u6ED1\u6761\uFF1A\u8D34\u5728\u6A21\u578B\u6309\u94AE\u4E0A\u65B9\u7684\u7D27\u51D1\u6D6E\u5C42\u3002\n   Compact popover: 280px wide, 13/18 model caption, 18px level headline and a\n   32px track. The slider eases between stops with one shared bezier curve. */\n\n.rs-trigger{display:flex;align-items:center;gap:5px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;height:28px;padding:0 8px;cursor:pointer;transition:background .15s ease,color .15s ease}\n.rs-trigger span{color:var(--dsw-alias-label-tertiary)}\n.rs-trigger:hover,.rs-trigger[aria-expanded=true]{background:var(--dsw-alias-bg-multi-select)}\n.rs-trigger:disabled{opacity:.55;cursor:default}\n.rs-trigger .rs-trigger-chev{display:block;flex:none;width:12px;height:12px;color:var(--dsw-alias-label-tertiary);transform-origin:center;transition:transform 220ms var(--rs-ease,cubic-bezier(.22,1,.36,1))}\n.rs-trigger[aria-expanded=true] .rs-trigger-chev{transform:rotate(180deg)}\n.rs-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:2px}\n\n.rs-panel{--rs-accent:var(--dsw-alias-state-business-primary,#4176e6);--rs-thumb:28px;--rs-ease:cubic-bezier(.25,.8,.25,1);--rs-move:380ms;\n  position:fixed;z-index:1000;width:min(280px,calc(100vw - 20px));box-sizing:border-box;\n  padding:10px 12px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;\n  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);\n  box-shadow:var(--dsw-elevation-prominent,0 10px 30px #0000001f);font-family:inherit;transform-origin:50% 100%}\n.rs-panel.rs-in{animation:rs-panel-in 240ms var(--rs-ease) both}\n@keyframes rs-panel-in{from{opacity:0;transform:translateY(8px) scale(.965)}to{opacity:1;transform:none}}\n.rs-panel button{font-family:inherit;cursor:pointer;border:0;background:transparent}\n.rs-panel button:disabled{opacity:.4;cursor:default}\n.rs-panel button:focus-visible{outline:2px solid var(--rs-accent);outline-offset:2px}\n\n.rs-reset{position:absolute;right:10px;top:8px;display:grid;place-items:center;width:28px;height:28px;\n  padding:0;border-radius:50%;color:var(--dsw-alias-label-tertiary);\n  transition:background .15s ease,color .15s ease,transform 240ms var(--rs-ease)}\n.rs-reset:hover{background:var(--dsw-alias-bg-multi-select);color:var(--dsw-alias-label-secondary)}\n.rs-reset:active{transform:rotate(-24deg)}\n.rs-reset svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}\n\n.rs-level{display:flex;align-items:center;justify-content:center;height:24px;overflow:hidden;\n  color:var(--rs-accent);font-size:18px;line-height:24px;font-weight:500;letter-spacing:.2px;white-space:nowrap}\n.rs-level-text{display:inline-block}\n\n.rs-model{display:flex;align-items:center;justify-content:center;gap:4px;max-width:100%;margin:1px auto 9px;\n  padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px;\n  transition:background .15s ease,color .15s ease}\n.rs-model:hover{background:var(--dsw-alias-bg-multi-select);color:var(--dsw-alias-label-primary)}\n.rs-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.rs-chev{display:inline-flex;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:1;\n  transition:transform 240ms var(--rs-ease)}\n.rs-model[aria-expanded=true] .rs-chev{transform:rotate(90deg)}\n\n.rs-slider{--v:0;position:relative;height:32px;border-radius:999px;outline:none;cursor:pointer;\n  touch-action:none;user-select:none;-webkit-user-select:none}\n.rs-slider[aria-disabled=true]{cursor:default;opacity:.5}\n.rs-panel[data-saving] .rs-slider[aria-disabled=true],.rs-panel[data-saving] button:disabled{opacity:1}\n.rs-track{position:absolute;inset:3px 0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);\n  border-radius:999px;background:var(--dsw-alias-bg-overlay)}\n.rs-fill{display:block;height:100%;width:calc(var(--rs-thumb)/2 + (100% - var(--rs-thumb)) * var(--v));\n  background:var(--rs-accent);transition:width var(--rs-move) var(--rs-ease)}\n.rs-ticks{position:absolute;inset:0 calc(var(--rs-thumb)/2);display:flex;align-items:center;justify-content:space-between}\n.rs-ticks i{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary);opacity:.85;\n  transition:background-color 200ms linear,opacity 200ms linear,transform 240ms var(--rs-ease)}\n.rs-ticks i.on{background:#fff;opacity:.5}\n.rs-ticks i:first-child{visibility:hidden}\n.rs-thumb{position:absolute;top:50%;left:calc(var(--rs-thumb)/2 + (100% - var(--rs-thumb)) * var(--v));\n  width:var(--rs-thumb);height:var(--rs-thumb);border-radius:50%;background:#fff;pointer-events:none;\n  box-shadow:0 1px 4px #00000030,0 0 0 .5px #0000000f;transform:translate(-50%,-50%);\n  transition:left var(--rs-move) var(--rs-ease),transform 260ms cubic-bezier(.34,1.4,.64,1),box-shadow 180ms ease}\n.rs-slider[data-dragging] .rs-thumb{\n  transform:translate(-50%,-50%) scale(.94);box-shadow:0 1px 3px #00000038,0 0 0 .5px #0000000f}\n.rs-slider:focus-visible .rs-track{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--rs-accent))}\n\n/* \u4ECE\u53F3\u7AEF\u6863\u4F4D\u5411\u5DE6\u5C55\u5F00\uFF0C\u4FDD\u7559\u5DE6\u4FA7\u54C1\u724C\u84DD\u3002 Reveal from the right stop, leaving the left blue. */\n.rs-panel{--rs-max-color:#4941cf;--rs-max-glint:#effcff}\nbody[data-ds-dark-theme] .rs-panel{--rs-max-color:#a5a0ff;--rs-max-glint:#f1fdff}\n.rs-panel[data-max] .rs-level{color:var(--rs-max-color)}\n.rs-max-field{position:absolute;top:0;bottom:0;right:calc((100% - var(--rs-thumb)) * (1 - var(--max-v)) + var(--rs-thumb)/2 - 1px);width:calc(92% * var(--max-v));\n  pointer-events:none;overflow:hidden;clip-path:inset(0);\n  background:linear-gradient(90deg,transparent 0%,#4454d9dd 8%,#4340dfee 30%,#6551f5 100%);\n  mask-image:linear-gradient(90deg,transparent,black 8%)}\n.rs-max-field[data-reveal]{animation:rs-max-reveal 850ms cubic-bezier(.22,1,.36,1) both}\n.rs-max-field[data-exit]{animation:rs-max-retreat 420ms cubic-bezier(.4,0,.2,1) both}\n@keyframes rs-max-retreat{from{clip-path:inset(0);opacity:1}to{clip-path:inset(0 0 0 100%);opacity:0}}\n@keyframes rs-max-reveal{from{clip-path:inset(0 0 0 100%)}to{clip-path:inset(0 0 0 0)}}\n.rs-max-glow{position:absolute;inset:-40% -5%;opacity:.65;\n  background:radial-gradient(ellipse at 72% 60%,#80cfffaa,transparent 48%);\n  animation:rs-max-breathe 4s ease-in-out infinite alternate}\n@keyframes rs-max-breathe{from{opacity:.4;transform:translateX(3%)}to{opacity:.8;transform:translateX(-4%)}}\n.rs-spark{position:absolute;width:var(--size);height:var(--size);border-radius:50%;\n  background:var(--rs-max-glint);box-shadow:0 0 3px #fff,0 0 7px #9cdcffb3;\n  animation:rs-spark-drift var(--duration) ease-in-out var(--delay) infinite;opacity:0}\n@keyframes rs-spark-drift{0%{opacity:0;transform:translate(5px,2px) scale(.7)}\n  20%,45%{opacity:1}75%{opacity:.8}100%{opacity:0;transform:translate(-20px,-5px) scale(.6)}}\n\n.rs-view{display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;\n  transition:grid-template-rows 320ms cubic-bezier(.22,1,.36,1),opacity 180ms cubic-bezier(.22,1,.36,1),visibility 0s 320ms}\n.rs-view[data-active]{grid-template-rows:1fr;opacity:1;visibility:visible;transition-delay:0s}\n.rs-view-inner{min-height:0;overflow:hidden;position:relative}\n.rs-view .rs-reset{top:0;right:0}\n.rs-picker-back{display:flex;align-items:center;gap:6px;padding:2px 7px 8px;color:var(--dsw-alias-label-tertiary);font-size:13px}\n.rs-picker-back:hover{color:var(--dsw-alias-label-primary)}\n.rs-panel[data-picking] .rs-max-field,.rs-panel[data-picking] .rs-max-glow,.rs-panel[data-picking] .rs-spark{animation-play-state:paused}\n.rs-models{max-height:min(300px,calc(100vh - 100px));overflow:auto;margin:0;padding:0}\n@keyframes rs-models-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}\n.rs-group + .rs-group{margin-top:4px}\n.rs-models small{display:block;padding:2px 7px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}\n.rs-models button{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;\n  padding:6px 7px;border-radius:6px;text-align:left;color:var(--dsw-alias-label-primary);\n  font-size:12.5px;line-height:18px;transition:background .15s ease}\n.rs-models button:hover{background:var(--dsw-alias-bg-multi-select)}\n.rs-models button[aria-current=true]{color:var(--rs-accent)}\n.rs-models p{margin:4px 7px;color:var(--dsw-alias-label-tertiary);font-size:12px}\n.rs-error{margin:10px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px}\n\nbody[data-ds-dark-theme] .rs-track{background:#3f3f3f;border-color:#545454}\nbody[data-ds-dark-theme] .rs-ticks i{background:#8a8a8a}\nbody[data-ds-dark-theme] .rs-ticks i.on{background:#fff}\n\n@media(max-width:480px){.rs-panel{width:min(280px,calc(100vw - 16px));padding:10px 12px 12px;border-radius:18px}\n.rs-level{font-size:18px}}\n\n@media(prefers-reduced-motion:reduce){\n  .rs-view{transition:none}\n  .rs-max-field,.rs-max-field[data-reveal],.rs-max-field[data-exit],.rs-max-glow,.rs-spark{animation:none}\n  .rs-spark{opacity:.8}\n  .rs-panel.rs-in,.rs-level-text,.rs-models{animation:none}\n  .rs-fill,.rs-thumb,.rs-ticks i,.rs-reset,.rs-chev,.rs-trigger-chev,.rs-model{transition:none}\n}\n";

// ReasoningSlider/src/client.jsx
var inject = ["slots", "modelDirectories", "sessions", "remote", "remote.session"];
var STEP_KEYS = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -1, PageUp: 1 };
var isMaxEffort = (level) => /^(max|ultra|ultracode)$/i.test(level?.id ?? "");
var SPARKS = Array.from({ length: 20 }, (_, i) => ({
  left: `${12 + i * 37 % 83}%`,
  top: `${19 + i * 29 % 64}%`,
  "--delay": `${-(i * 0.31)}s`,
  "--duration": `${2.1 + i % 4 * 0.3}s`,
  "--size": `${i % 4 === 0 ? 3.4 : 2.2}px`
}));
function Range({ levels, value, label, disabled, onPreview, onCommit, onCancel }) {
  const root = (0, import_react.useRef)(null);
  const dragging = (0, import_react.useRef)(false);
  const [active, setActive] = (0, import_react.useState)(false);
  const max = Math.max(0, levels.length - 1);
  const index = Math.min(max, Math.max(0, Math.round(value)));
  const fraction = max === 0 ? 0 : index / max;
  const stepDisabled = disabled || levels.length < 2;
  const maxEffect = isMaxEffort(levels[index]) && Math.abs(value - index) < 0.02;
  const previousMax = (0, import_react.useRef)(maxEffect);
  const [revealMax, setRevealMax] = (0, import_react.useState)(false);
  const [leavingMax, setLeavingMax] = (0, import_react.useState)(false);
  const maxFraction = (0, import_react.useRef)(fraction);
  const exitTimer = (0, import_react.useRef)(null);
  (0, import_react.useLayoutEffect)(() => {
    if (maxEffect) {
      clearTimeout(exitTimer.current);
      maxFraction.current = fraction;
      setLeavingMax(false);
    } else if (previousMax.current) {
      clearTimeout(exitTimer.current);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setLeavingMax(!reduced);
      if (!reduced) exitTimer.current = setTimeout(() => setLeavingMax(false), 420);
    }
    setRevealMax(maxEffect && !previousMax.current);
    previousMax.current = maxEffect;
  }, [maxEffect, fraction]);
  (0, import_react.useEffect)(() => () => clearTimeout(exitTimer.current), []);
  const position = (event) => {
    const el = root.current;
    if (!el || max === 0) return 0;
    const rect = el.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(el).getPropertyValue("--rs-thumb")) || 34;
    const usable = Math.max(1, rect.width - thumb);
    return Math.round(Math.min(max, Math.max(0, (event.clientX - rect.left - thumb / 2) / usable * max)));
  };
  const down = (event) => {
    if (stepDisabled || event.button !== 0) return;
    event.preventDefault();
    dragging.current = true;
    setActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    onPreview(position(event));
  };
  const move = (event) => {
    if (!dragging.current) return;
    onPreview(position(event));
  };
  const up = (event) => {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    const next = Math.round(position(event));
    onPreview(next);
    onCommit(next);
  };
  const cancel = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    onCancel();
  };
  const key = (event) => {
    if (stepDisabled) return;
    const step = STEP_KEYS[event.key];
    if (step !== void 0) {
      event.preventDefault();
      onCommit(Math.min(max, Math.max(0, index + step)));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onCommit(event.key === "Home" ? 0 : max);
    }
  };
  return /* @__PURE__ */ import_react.default.createElement(
    "div",
    {
      ref: root,
      className: "rs-slider",
      role: "slider",
      tabIndex: stepDisabled ? -1 : 0,
      "aria-label": "\u63A8\u7406\u5F3A\u5EA6",
      "aria-orientation": "horizontal",
      "aria-disabled": stepDisabled || void 0,
      "aria-valuemin": 0,
      "aria-valuemax": max,
      "aria-valuenow": index,
      "aria-valuetext": label,
      "data-dragging": active || void 0,
      style: { "--v": fraction },
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown: key
    },
    /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-track", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-fill" }), (maxEffect || leavingMax) && /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-max-field", style: { "--max-v": maxEffect ? fraction : maxFraction.current }, "data-exit": leavingMax || void 0, "data-reveal": revealMax || void 0 }, /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-max-glow" }), SPARKS.map((style, i) => /* @__PURE__ */ import_react.default.createElement("i", { key: i, className: "rs-spark", style }))), /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-ticks" }, levels.map((level, i) => /* @__PURE__ */ import_react.default.createElement("i", { key: level.id ?? "default", className: i <= index ? "on" : "" })))),
    /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-thumb", "aria-hidden": "true" })
  );
}
function Slider({ directory, available, locked }) {
  const state = (0, import_react.useSyncExternalStore)((fn) => directory.store.subscribe(fn), () => directory.store.getSnapshot());
  const [open, setOpen] = (0, import_react.useState)(false);
  const [picking, setPicking] = (0, import_react.useState)(false);
  const [drag, setDrag] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)("");
  const [position, setPosition] = (0, import_react.useState)({ visibility: "hidden" });
  const [placed, setPlaced] = (0, import_react.useState)(false);
  const trigger = (0, import_react.useRef)(null), panel = (0, import_react.useRef)(null);
  const submitting = (0, import_react.useRef)(false), settle = (0, import_react.useRef)(0);
  const choices = state.groups.flatMap((group) => group.models.map((model) => ({ group, model })));
  const current = choices.find((c) => c.group.id === state.current?.provider && c.model.id === state.current?.model);
  const reasoning = current?.model.reasoning;
  const levels = reasoning ? [
    ...reasoning.defaultEffort === void 0 ? [{ id: void 0, name: "\u9ED8\u8BA4" }] : [],
    ...reasoning.efforts
  ] : [];
  const effective = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
  const selected = levels.findIndex((level) => level.id === effective);
  const value = drag ?? Math.max(0, selected);
  const index = levels.length ? Math.min(levels.length - 1, Math.max(0, Math.round(value))) : 0;
  const label = levels.length ? levels[index]?.name ?? "" : current ? "\u65E0\u63A8\u7406\u6863\u4F4D" : "\u9009\u62E9\u6A21\u578B";
  const busy = state.pending !== null || locked || !available;
  (0, import_react.useEffect)(() => {
    if (available) directory.load().catch((e) => setError(e.message));
  }, [directory, available]);
  (0, import_react.useEffect)(() => {
    setDrag(null);
    clearTimeout(settle.current);
  }, [state.current?.provider, state.current?.model, effective]);
  (0, import_react.useEffect)(() => () => clearTimeout(settle.current), []);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const outside = (e) => {
      if (!panel.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        if (picking && current) setPicking(false);
        else {
          setOpen(false);
          trigger.current?.focus();
        }
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, picking, Boolean(current)]);
  (0, import_react.useLayoutEffect)(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current.getBoundingClientRect(), p = panel.current;
      setPosition({
        left: Math.max(12, Math.min(r.right - p.offsetWidth, innerWidth - p.offsetWidth - 12)),
        top: Math.max(12, r.top - p.offsetHeight - 12)
      });
      setPlaced(true);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  async function select(selection) {
    if (submitting.current) return;
    clearTimeout(settle.current);
    submitting.current = true;
    setError("");
    try {
      const result = await directory.select(selection);
      if (!result.ok) {
        setError(result.error.message);
        setDrag(null);
      }
    } catch (e) {
      setError(e.message);
      setDrag(null);
    } finally {
      submitting.current = false;
    }
  }
  function choose(next) {
    if (busy || !current || !levels[next]) {
      setDrag(null);
      return;
    }
    setDrag(next);
    if (next === selected) {
      clearTimeout(settle.current);
      settle.current = setTimeout(() => setDrag(null), 420);
      return;
    }
    select({
      provider: current.group.id,
      model: current.model.id,
      ...levels[next].id === void 0 ? {} : { reasoningEffort: levels[next].id }
    });
  }
  function reset() {
    if (!current || busy) return;
    const target = levels.findIndex((level) => level.id === reasoning?.defaultEffort);
    if (target >= 0) setDrag(target);
    return select({
      provider: current.group.id,
      model: current.model.id,
      ...reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: reasoning.defaultEffort }
    });
  }
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      ref: trigger,
      className: "rs-trigger",
      disabled: !available || locked,
      "aria-label": "\u63A8\u7406\u6ED1\u6761",
      "aria-expanded": open,
      onClick: () => {
        setOpen(!open);
        setPicking(!current);
      }
    },
    current?.model.name ?? "\u8BF7\u9009\u62E9\u6A21\u578B",
    " ",
    /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-trigger-level" }, current && (levels[selected]?.name ?? "")),
    /* @__PURE__ */ import_react.default.createElement("svg", { className: "rs-trigger-chev", width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m2.5 4.25 3.5 3.5 3.5-3.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }))
  ), open && (0, import_react_dom.createPortal)(/* @__PURE__ */ import_react.default.createElement("section", { ref: panel, className: `rs-panel${placed ? " rs-in" : ""}`, "data-picking": picking || void 0, "data-saving": state.pending !== null || void 0, "data-max": isMaxEffort(levels[index]) || void 0, style: position, "aria-label": "\u63A8\u7406\u8BBE\u7F6E" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "rs-view", "data-active": !picking || void 0, "aria-hidden": picking || void 0, inert: picking ? "" : void 0 }, /* @__PURE__ */ import_react.default.createElement("div", { className: "rs-view-inner" }, /* @__PURE__ */ import_react.default.createElement("button", { className: "rs-reset", title: "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u8BBE\u7F6E", "aria-label": "\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u8BBE\u7F6E", disabled: !levels.length || busy, onClick: reset }, /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M3 10a9 9 0 1 1 2 8M3 4v6h6" }))), /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-level", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-level-text" }, label)), /* @__PURE__ */ import_react.default.createElement("button", { className: "rs-model", "aria-expanded": picking, onClick: () => setPicking(!picking) }, /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-model-name" }, current?.model.name ?? "\u9009\u62E9\u6A21\u578B"), /* @__PURE__ */ import_react.default.createElement("span", { className: "rs-chev", "aria-hidden": "true" }, "\u203A")), levels.length > 0 && /* @__PURE__ */ import_react.default.createElement(
    Range,
    {
      levels,
      value,
      label,
      disabled: busy,
      onPreview: setDrag,
      onCommit: choose,
      onCancel: () => setDrag(null)
    }
  ))), /* @__PURE__ */ import_react.default.createElement("div", { className: "rs-view", "data-active": picking || void 0, "aria-hidden": !picking || void 0, inert: !picking ? "" : void 0 }, /* @__PURE__ */ import_react.default.createElement("div", { className: "rs-view-inner" }, /* @__PURE__ */ import_react.default.createElement("button", { className: "rs-picker-back", onClick: () => {
    setPicking(false);
  }, "aria-label": "\u8FD4\u56DE\u63A8\u7406\u5F3A\u5EA6" }, "\u2039 ", /* @__PURE__ */ import_react.default.createElement("span", null, "\u9009\u62E9\u6A21\u578B")), /* @__PURE__ */ import_react.default.createElement("div", { className: "rs-models" }, state.groups.map((group) => /* @__PURE__ */ import_react.default.createElement("div", { className: "rs-group", key: group.id }, /* @__PURE__ */ import_react.default.createElement("small", null, group.name), group.models.map((model) => /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      key: model.id,
      disabled: busy,
      "aria-current": model.id === current?.model.id && group.id === current?.group.id,
      onClick: () => {
        select({ provider: group.id, model: model.id, ...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort } });
        setPicking(false);
      }
    },
    /* @__PURE__ */ import_react.default.createElement("span", null, model.name),
    model.id === current?.model.id && group.id === current?.group.id && /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true" }, "\u2713")
  )))), state.status === "loading" && /* @__PURE__ */ import_react.default.createElement("p", null, "\u52A0\u8F7D\u4E2D\u2026"), !choices.length && state.status !== "loading" && /* @__PURE__ */ import_react.default.createElement("p", null, "\u6682\u65E0\u53EF\u7528\u6A21\u578B")))), (error || state.error) && /* @__PURE__ */ import_react.default.createElement("p", { className: "rs-error", role: "alert" }, error || state.error)), document.body));
}
function apply(ctx) {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = style_default;
    document.head.append(style);
    return () => style.remove();
  });
  ctx.slots.inject("conversation.input.model", () => ctx.slots.register({
    name: "conversation.input.model",
    priority: -10,
    inject: (sessionId) => ({ directory: ctx.modelDirectories.directoryFor(sessionId), available: ctx.sessions.subagentAddress(sessionId) === void 0 })
  }, Slider));
}

return module.exports;}});
