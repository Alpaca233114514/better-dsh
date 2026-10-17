var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/host.ts
import { mkdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/remote.ts
import { z } from "zod";
var bucket = z.object({ input: z.number(), cacheRead: z.number(), cacheWrite: z.number(), output: z.number(), total: z.number() });
var stateSchema = z.object({
  cumulative: bucket,
  today: bucket,
  peakRoundTokens: z.number(),
  peakRoundDate: z.string().nullable(),
  longestRoundMs: z.number(),
  longestRoundDate: z.string().nullable(),
  daily: z.record(z.string(), z.object({ input: z.number(), cache: z.number(), cacheWrite: z.number().optional(), output: z.number() })),
  generatedAt: z.number(),
  persistenceError: z.string().nullable()
});
var contribution = {
  package: "dsh-token-meter-dashboard",
  descriptors: ["state", "reset"].map((method) => ({
    id: `tokenMeterDashboard#${method}`,
    service: "tokenMeterDashboard",
    namespace: "tokenMeterDashboard",
    method,
    invocation: { kind: "direct" },
    parameters: [],
    result: { mode: "strict", typeSymbol: "TokenMeterDashboardState", create: () => stateSchema }
  }))
};

// src/generated-host.js
function createMeter(harness) {
  return {
    inject: ["timer", "fs", "sandboxPolicy"],
    apply(ctx) {
      const fs = ctx.get("fs");
      const sandboxPolicy = ctx.get("sandboxPolicy");
      let fileTarget = null;
      let root = null;
      let rootSource = null;
      let dirty = false;
      let targetPromise = null;
      let saveQueue = Promise.resolve();
      let revision = 0;
      let loadError = null;
      let saveError = null;
      let nativeReady = false;
      const state = {
        totalInput: 0,
        // 输入（含缓存命中）
        totalCacheRead: 0,
        // 其中缓存命中
        totalCacheWrite: 0,
        // 其中缓存写入
        totalOutput: 0,
        peakRoundTokens: 0,
        peakRoundDate: null,
        longestRoundMs: 0,
        longestRoundDate: null,
        daily: {}
        // 'YYYY-MM-DD' -> { input, cache, output }
      };
      const activeRounds = /* @__PURE__ */ new Map();
      function dateKey(at) {
        const d = new Date(at);
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return d.getFullYear() + "-" + m + "-" + day;
      }
      function collectRoots() {
        const roots = [];
        const seen = /* @__PURE__ */ new Set();
        const push = (r) => {
          if (r && !seen.has(r)) {
            seen.add(r);
            roots.push(r);
          }
        };
        if (harness.storageRoot) push(harness.storageRoot);
        try {
          const sessions = ctx.get("sessions");
          if (sessions) {
            const all = sessions.list();
            for (let i = all.length - 1; i >= 0; i--) {
              const cwd = all[i] && all[i].header && all[i].header.cwd;
              if (cwd) push(cwd);
            }
          }
        } catch (err) {
        }
        try {
          const agents = ctx.get("agents");
          if (agents) {
            const all = agents.list();
            for (let i = all.length - 1; i >= 0; i--) {
              const cwd = all[i] && all[i].session && all[i].session.header && all[i].session.header.cwd;
              if (cwd) push(cwd);
            }
          }
        } catch (err) {
        }
        try {
          if (sandboxPolicy && sandboxPolicy.workspaceRoot) push(sandboxPolicy.workspaceRoot);
        } catch (err) {
        }
        return roots;
      }
      async function findExistingTarget() {
        if (!fs) return [];
        const files = [];
        for (const r of collectRoots()) {
          try {
            const t = await fs.resolve(".dsh-token-meter.json", { cwd: r });
            const info = await fs.stat(t);
            if (info) files.push({ root: r, fileTarget: t });
          } catch (err) {
          }
        }
        return files;
      }
      async function absorbFrom(other) {
        if (!fs) return;
        try {
          const text = await fs.readText(other.fileTarget);
          const p = JSON.parse(text);
          if (!p || typeof p !== "object") return;
          const num = (v) => Number(v) || 0;
          state.totalInput = Math.max(state.totalInput, num(p.totalInput));
          state.totalCacheRead = Math.max(state.totalCacheRead, num(p.totalCacheRead));
          state.totalCacheWrite = Math.max(state.totalCacheWrite, num(p.totalCacheWrite));
          state.totalOutput = Math.max(state.totalOutput, num(p.totalOutput));
          if (num(p.peakRoundTokens) > state.peakRoundTokens) {
            state.peakRoundTokens = num(p.peakRoundTokens);
            state.peakRoundDate = p.peakRoundDate || null;
          }
          if (num(p.longestRoundMs) > state.longestRoundMs) {
            state.longestRoundMs = num(p.longestRoundMs);
            state.longestRoundDate = p.longestRoundDate || null;
          }
          if (p.daily && typeof p.daily === "object") {
            for (const [k, v] of Object.entries(p.daily)) {
              if (!v || typeof v !== "object") continue;
              const cur = state.daily[k] || (state.daily[k] = { input: 0, cache: 0, output: 0 });
              cur.input = Math.max(cur.input, num(v.input));
              cur.cache = Math.max(cur.cache, num(v.cache));
              cur.cacheWrite = Math.max(cur.cacheWrite || 0, num(v.cacheWrite));
              cur.output = Math.max(cur.output, num(v.output));
            }
          }
          dirty = true;
          console.log("[token-meter] absorbed data from", other.root);
        } catch (err) {
          console.error("[token-meter] absorb failed:", err && err.message ? err.message : err);
        }
      }
      function pickRoot() {
        try {
          if (sandboxPolicy && sandboxPolicy.workspaceRoot) {
            rootSource = "sandboxPolicy";
            return sandboxPolicy.workspaceRoot;
          }
        } catch (err) {
        }
        try {
          const sessions = ctx.get("sessions");
          if (sessions) {
            for (const s of sessions.list()) {
              const cwd = s && s.header && s.header.cwd;
              if (cwd) {
                rootSource = "sessions";
                return cwd;
              }
            }
          }
        } catch (err) {
        }
        try {
          const agents = ctx.get("agents");
          if (agents) {
            for (const a of agents.list()) {
              const cwd = a && a.session && a.session.header && a.session.header.cwd;
              if (cwd) {
                rootSource = "agents";
                return cwd;
              }
            }
          }
        } catch (err) {
        }
        rootSource = null;
        return null;
      }
      function ensureTarget(preferred) {
        if (targetPromise) return targetPromise;
        targetPromise = resolveTarget(preferred).catch((err) => {
          loadError = "\u5386\u53F2\u6570\u636E\u8BFB\u53D6\u5931\u8D25\uFF0C\u5DF2\u6682\u505C\u5199\u5165\u4EE5\u4FDD\u7559\u539F\u6587\u4EF6\u3002";
          console.error("[token-meter] storage unavailable:", err && err.message ? err.message : err);
        }).finally(() => {
          targetPromise = null;
        });
        return targetPromise;
      }
      async function resolveTarget(preferred) {
        if (!fs || fileTarget && (!harness.storageRoot || nativeReady)) return;
        if (harness.storageRoot) {
          root = harness.storageRoot;
          rootSource = "dsh-home";
          fileTarget = await fs.resolve(".dsh-token-meter.json", { cwd: root });
          if (await fs.stat(fileTarget)) {
            await load();
            nativeReady = true;
          } else {
            const legacy = (await findExistingTarget()).find((entry) => entry.root !== root);
            if (legacy) {
              await absorbFrom(legacy);
              nativeReady = true;
            }
          }
          return;
        }
        const files = await findExistingTarget();
        if (files.length > 0) {
          root = files[0].root;
          rootSource = "existing-data";
          fileTarget = files[0].fileTarget;
          await load();
          for (let i = 1; i < files.length; i++) {
            await absorbFrom(files[i]);
          }
          if (dirty) scheduleSave();
          return;
        }
        const r = preferred || pickRoot();
        if (!r) return;
        try {
          root = r;
          fileTarget = await fs.resolve(".dsh-token-meter.json", { cwd: r });
          await load();
        } catch (err) {
          fileTarget = null;
          root = null;
          console.error("[token-meter] resolve failed:", err && err.message ? err.message : err);
        }
      }
      async function load() {
        if (!fs || !fileTarget) return;
        try {
          const info = await fs.stat(fileTarget);
          if (!info) return;
          const text = await fs.readText(fileTarget);
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid meter data");
          state.totalInput = Number(parsed.totalInput) || 0;
          state.totalCacheRead = Number(parsed.totalCacheRead) || 0;
          state.totalCacheWrite = Number(parsed.totalCacheWrite) || 0;
          state.totalOutput = Number(parsed.totalOutput) || 0;
          state.peakRoundTokens = Number(parsed.peakRoundTokens) || 0;
          state.peakRoundDate = parsed.peakRoundDate || null;
          state.longestRoundMs = Number(parsed.longestRoundMs) || 0;
          state.longestRoundDate = parsed.longestRoundDate || null;
          state.daily = {};
          if (parsed.daily && typeof parsed.daily === "object") {
            for (const [k, v] of Object.entries(parsed.daily)) {
              if (v && typeof v === "object") {
                state.daily[k] = {
                  input: Number(v.input) || 0,
                  cache: Number(v.cache) || 0,
                  cacheWrite: Number(v.cacheWrite) || 0,
                  output: Number(v.output) || 0
                };
              }
            }
          }
          prune();
        } catch (err) {
          loadError = "\u5386\u53F2\u6570\u636E\u8BFB\u53D6\u5931\u8D25\uFF0C\u5DF2\u6682\u505C\u5199\u5165\u4EE5\u4FDD\u7559\u539F\u6587\u4EF6\u3002";
          console.error("[token-meter] load failed:", err && err.message ? err.message : err);
        }
      }
      async function save() {
        const operation = async () => {
          if (!fs || !fileTarget || !root || loadError) return;
          const savedRevision = revision;
          try {
            const sessions = ctx.get("sessions");
            const session = sessions && sessions.list().find((s) => s.header.cwd === root);
            const policy = sandboxPolicy.resolve(session ? { session } : {});
            await fs.writeText(fileTarget, JSON.stringify(state), void 0, void 0, {
              ...policy,
              mode: policy.mode === "read-only" ? "read-only" : "workspace-write",
              workspaceRoot: root
            });
            dirty = revision !== savedRevision;
            saveError = null;
          } catch (err) {
            saveError = "\u8BA1\u91CF\u6570\u636E\u4FDD\u5B58\u5931\u8D25\uFF0C\u5C06\u81EA\u52A8\u91CD\u8BD5\u3002";
            console.error("[token-meter] save failed:", err && err.message ? err.message : err);
          }
        };
        saveQueue = saveQueue.then(operation, operation);
        return saveQueue;
      }
      function prune() {
        const cut = dateKey(Date.now() - 400 * 864e5);
        for (const k of Object.keys(state.daily)) {
          if (k < cut) delete state.daily[k];
        }
      }
      const scheduleSave = ctx.debounce(() => {
        save();
      }, 1500);
      function recordUsage(sessionId, usage, at) {
        const cacheWrite = Number(usage.cacheWriteTokens) || 0;
        const input = (Number(usage.inputTokens) || 0) + (Number(usage.cacheReadTokens) || 0) + cacheWrite;
        const cache = Number(usage.cacheReadTokens) || 0;
        const output = Number(usage.outputTokens) || 0;
        if (input + output <= 0) return;
        state.totalInput += input;
        state.totalCacheRead += cache;
        state.totalCacheWrite += cacheWrite;
        state.totalOutput += output;
        const key = dateKey(at);
        const entry = state.daily[key] || (state.daily[key] = { input: 0, cache: 0, cacheWrite: 0, output: 0 });
        entry.input += input;
        entry.cache += cache;
        entry.cacheWrite = (entry.cacheWrite || 0) + cacheWrite;
        entry.output += output;
        if (sessionId) {
          const round = activeRounds.get(sessionId);
          if (round) round.tokens += input + output;
        }
        dirty = true;
        revision++;
        if (!fileTarget) ensureTarget();
        scheduleSave();
      }
      ctx.on("llm/stream", (options, next) => {
        const inner = next();
        let usage = null;
        async function* wrapped() {
          try {
            for await (const chunk of inner) {
              if (chunk && chunk.type === "usage" && chunk.usage) usage = chunk.usage;
              yield chunk;
            }
          } finally {
            if (usage) {
              await ensureTarget();
              recordUsage(options.sessionId, usage, Date.now());
            }
          }
        }
        return wrapped();
      }, { global: true });
      ctx.on("agent/inbox/claimed", (payload) => {
        const id = payload.agent.id;
        const cur = activeRounds.get(id);
        if (!cur || cur.turn !== payload.turn) {
          activeRounds.set(id, { turn: payload.turn, startedAt: Date.now(), tokens: 0 });
        }
      }, { global: true });
      ctx.on("agent/turn-stopping", async (payload) => {
        await ensureTarget();
        const id = payload.agent.id;
        const round = activeRounds.get(id);
        if (round && round.turn === payload.turn) {
          const now = Date.now();
          const dur = now - round.startedAt;
          if (dur > state.longestRoundMs) {
            state.longestRoundMs = dur;
            state.longestRoundDate = dateKey(now);
          }
          if (round.tokens > state.peakRoundTokens) {
            state.peakRoundTokens = round.tokens;
            state.peakRoundDate = dateKey(now);
          }
          activeRounds.delete(id);
          dirty = true;
          revision++;
          scheduleSave();
        }
      }, { global: true });
      ctx.on("agent/created", (payload) => {
        const cwd = payload && payload.agent && payload.agent.session && payload.agent.session.header && payload.agent.session.header.cwd;
        if (cwd) ensureTarget(cwd);
      }, { global: true });
      ctx.interval(() => {
        if (dirty) {
          return save();
        } else if (!fileTarget) {
          return ensureTarget();
        }
      }, 1e4);
      function buildState() {
        const today = dateKey(Date.now());
        const t = state.daily[today];
        const mk = (input, cache, output, cacheWrite) => ({
          input,
          cacheRead: cache,
          cacheWrite,
          output,
          total: input + output
        });
        return {
          cumulative: mk(state.totalInput, state.totalCacheRead, state.totalOutput, state.totalCacheWrite),
          today: mk(t ? t.input : 0, t ? t.cache : 0, t ? t.output : 0, t ? t.cacheWrite || 0 : 0),
          peakRoundTokens: state.peakRoundTokens,
          peakRoundDate: state.peakRoundDate,
          longestRoundMs: state.longestRoundMs,
          longestRoundDate: state.longestRoundDate,
          daily: state.daily,
          generatedAt: Date.now(),
          persistenceError: loadError || saveError
        };
      }
      harness.handle("meter:state", async () => {
        await ensureTarget();
        return buildState();
      });
      harness.handle("meter:diag", () => ({
        root,
        rootSource,
        fileTargetReady: !!fileTarget,
        totalInput: state.totalInput,
        totalCacheRead: state.totalCacheRead,
        totalCacheWrite: state.totalCacheWrite,
        totalOutput: state.totalOutput,
        dailyDays: Object.keys(state.daily).length,
        activeRounds: activeRounds.size,
        dirty,
        now: Date.now()
      }));
      harness.handle("meter:reset", async () => {
        await ensureTarget();
        state.totalInput = 0;
        state.totalCacheRead = 0;
        state.totalCacheWrite = 0;
        state.totalOutput = 0;
        state.peakRoundTokens = 0;
        state.peakRoundDate = null;
        state.longestRoundMs = 0;
        state.longestRoundDate = null;
        state.daily = {};
        activeRounds.clear();
        dirty = true;
        revision++;
        await save();
        if (loadError || saveError) throw new Error(loadError || saveError);
        return buildState();
      });
      ctx.effect(() => {
        ensureTarget();
        return () => {
          scheduleSave.dispose();
          if (dirty) return save();
        };
      });
    }
  };
}

// src/host.ts
var inject = ["timer", "fs", "sandboxPolicy", "sessions", "typert"];
function apply(ctx) {
  var _reset_dec, _state_dec, _a, _init;
  const handlers = /* @__PURE__ */ new Map();
  const storageRoot = join(process.env.DSH_HOME?.trim() || join(homedir(), ".dsh"), "state", "token-meter-dashboard");
  const file = join(storageRoot, ".dsh-token-meter.json");
  const originalFS = ctx.get("fs");
  const privateTarget = { privateMeterFile: true };
  const fs = {
    resolve: (name, options) => options.cwd === storageRoot ? privateTarget : originalFS.resolve(name, options),
    stat: async (target) => {
      if (target !== privateTarget) return originalFS.stat(target);
      try {
        return await stat(file);
      } catch (error) {
        if (error.code === "ENOENT") return void 0;
        throw error;
      }
    },
    readText: (target) => target === privateTarget ? readFile(file, "utf8") : originalFS.readText(target),
    writeText: async (target, text) => {
      if (target !== privateTarget) throw new Error("Token Meter writes only its own data file");
      await mkdir(storageRoot, { recursive: true });
      const temporary = file + ".tmp";
      await writeFile(temporary, text, "utf8");
      await rename(temporary, file);
    }
  };
  const bridge = { storageRoot, handle: (name, fn) => handlers.set(name, fn) };
  const core = createMeter(bridge);
  const scope = new Proxy(ctx, { get(target, key) {
    if (key === "get") return (name) => name === "fs" ? fs : target.get(name);
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  core.apply(scope);
  ctx.typert.remotes.register(contribution);
  class MeterRemote extends (_a = TypertRemoteService, _state_dec = [Remote], _reset_dec = [Remote], _a) {
    constructor() {
      super(ctx, "tokenMeterDashboard");
      __runInitializers(_init, 5, this);
    }
    async state() {
      return handlers.get("meter:state")();
    }
    async reset() {
      return handlers.get("meter:reset")();
    }
  }
  _init = __decoratorStart(_a);
  __decorateElement(_init, 1, "state", _state_dec, MeterRemote);
  __decorateElement(_init, 1, "reset", _reset_dec, MeterRemote);
  __decoratorMetadata(_init, MeterRemote);
  new MeterRemote();
}
export {
  apply,
  inject
};
