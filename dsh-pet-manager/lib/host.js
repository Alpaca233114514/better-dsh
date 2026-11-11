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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/host.ts
import z2 from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// src/remote.ts
import { z } from "zod";
var requestSchema = z.object({ action: z.enum(["sync", "poll", "hide"]), owner: z.string().min(1).max(100), state: z.object({ svg: z.string().max(1e5), name: z.string().max(48), enabled: z.boolean(), animated: z.boolean(), size: z.number().min(72).max(180), status: z.enum(["idle", "running", "waiting", "completed", "failed"]), dark: z.boolean(), text: z.string().max(1e3), notices: z.array(z.string().max(1e3)).max(5) }).optional() }).strict();
var resultSchema = z.object({ available: z.boolean(), message: z.string(), actions: z.array(z.enum(["chat", "voice", "notifications"])) });
var contribution = { package: "dsh-pet-manager", descriptors: [{
  id: "dsh-pet-manager#run",
  service: "petManager",
  namespace: "petManager",
  method: "run",
  invocation: { kind: "direct" },
  parameters: [{ name: "request", wire: "request", source: "json", codec: { mode: "strict", typeSymbol: "PetRequest", schema: requestSchema, create: () => requestSchema } }],
  result: { mode: "strict", typeSymbol: "PetResult", schema: resultSchema, create: () => resultSchema }
}] };

// src/host.ts
var inject = ["typert"];
var Config = z2.object({
  enabled: z2.boolean().default(true).volatile(),
  animated: z2.boolean().default(true).volatile(),
  size: z2.number().min(72).max(180).default(112).volatile(),
  selected: z2.string().default("alpaca").volatile(),
  library: z2.string().default("[]").volatile(),
  desktop: z2.boolean().default(false).volatile()
});
var _run_dec, _a, _init;
var PetService = class extends (_a = TypertRemoteService, _run_dec = [Remote], _a) {
  constructor(ctx) {
    super(ctx, "petManager");
    __runInitializers(_init, 5, this);
    __publicField(this, "child");
    __publicField(this, "owner", "");
    __publicField(this, "lastSeen", 0);
    __publicField(this, "actions", []);
    __publicField(this, "message", "");
    ctx.effect(() => {
      const timer = setInterval(() => {
        if (Date.now() - this.lastSeen > 1e4) this.stop();
      }, 5e3);
      timer.unref();
      return () => {
        clearInterval(timer);
        this.stop();
      };
    });
  }
  stop() {
    this.child?.kill();
    this.child = void 0;
    this.owner = "";
    this.actions = [];
  }
  async run(raw) {
    const req = requestSchema.parse(raw);
    if (this.owner && this.owner !== req.owner && Date.now() - this.lastSeen < 1e4) return { available: false, message: "\u684C\u9762\u4F19\u4F34\u7531\u53E6\u4E00\u4E2A DSH \u7A97\u53E3\u8FDE\u63A5", actions: [] };
    this.owner = req.owner;
    this.lastSeen = Date.now();
    if (req.action === "hide") {
      this.stop();
      return { available: true, message: "", actions: [] };
    }
    if (req.action === "sync" && req.state) {
      if (!this.child) {
        try {
          const packageFile = createRequire(import.meta.url).resolve("electron/package.json");
          const directory = dirname(packageFile);
          const executable = join(directory, "dist", readFileSync(join(directory, "path.txt"), "utf8").trim());
          if (!existsSync(executable)) throw new Error("Electron binary missing");
          const env = { ...process.env };
          delete env.ELECTRON_RUN_AS_NODE;
          this.child = spawn(executable, [fileURLToPath(new URL("../native/main.cjs", import.meta.url))], { env, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
          const child = this.child;
          child.on("message", (m) => {
            if (["chat", "voice", "notifications"].includes(m?.action)) this.actions = [...this.actions.slice(-15), m.action];
          });
          child.on("error", (error) => {
            this.message = error.message;
            if (this.child === child) this.child = void 0;
          });
          child.on("exit", () => {
            if (this.child === child) {
              this.child = void 0;
              this.message = "\u684C\u9762\u7A97\u53E3\u5DF2\u5173\u95ED";
            }
          });
          child.once("message", () => {
            if (child.connected) child.send(req.state);
          });
        } catch {
          this.message = "\u672A\u627E\u5230 Electron \u684C\u9762\u8FD0\u884C\u65F6\uFF0C\u8BF7\u5B89\u88C5\u53EF\u9009\u4F9D\u8D56\u540E\u91CD\u542F DSH";
        }
      } else if (this.child.connected) this.child.send(req.state);
    }
    const actions = this.actions.splice(0);
    return { available: Boolean(this.child), message: this.child ? "" : this.message, actions };
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "run", _run_dec, PetService);
__decoratorMetadata(_init, PetService);
function apply(ctx, config = {}) {
  ctx.inject(["settings"], (scope) => {
    if (typeof scope.settings.configure === "function") scope.effect(() => scope.settings.configure({ auto: true }, ctx.fiber));
    else scope.settings.register("dsh-pet-manager", Config, { base: config });
  });
  ctx.typert.remotes.register(contribution);
  new PetService(ctx);
}
export {
  Config,
  apply,
  inject
};
