const levels = [{id:'low',name:'低'},{id:'medium',name:'中'},{id:'high',name:'高'},{id:'xhigh',name:'超高'},{id:'max',name:'极高'},{id:'ultra',name:'最高'}];
const models = [
  {id:'slider-six',name:'滑条测试模型 · 六档',reasoning:{efforts:levels,defaultEffort:'medium'}},
  {id:'slider-three',name:'滑条测试模型 · 三档',reasoning:{efforts:levels.slice(0,3),defaultEffort:'high'}},
  {id:'slider-plain',name:'滑条测试模型 · 无推理'},
];
class Catalog {
  providerRetryPolicy() { return undefined; }
  imageRequestPricing() { return undefined; }
  imageRequestTransform() { return undefined; }
  async prepareCall(provider, id) { return {model:await this.resolveModel(provider,id),stream:options=>this.stream(options)}; }
  providerInfo(id) { return {id,name:'本地 UI 调试（不调用模型）'}; }
  async listModels(provider) { return models.map(model => ({provider,...model})); }
  async resolveModel(provider,id) { const model=models.find(m=>m.id===id); if(!model) throw new Error('Unknown debug model'); return {provider,...model}; }
  async *stream() { throw new Error('此目录仅用于 UI 调试，不提供模型推理。'); }
}
export const inject=['llm'];
export function apply(ctx) { ctx.llm.registerAdapter(['slider-debug'],new Catalog()); }
