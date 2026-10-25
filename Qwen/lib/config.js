import z from '@deepseek-ai/schemastery';
import { DEFAULT_THINKING_BUDGETS } from './catalog.js';
export const Config = z.object({
    enabled: z.boolean().default(true).description('启用 Qwen'),
    route: z.string().default('qwen-flash').description('模型路由；与已有提供方保持不同名称'),
    displayName: z.string().default('Qwen').description('选择器名称'),
    baseURL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1').description('兼容模式 API 地址；Maas 请填工作空间地址'),
    apiKeyEnv: z.string().default('QWEN_API_KEY').role('credential-ref').description('DSH 凭据引用'),
    models: z.array(z.object({
        id: z.string().required().description('服务端实际接受的模型 ID'),
        name: z.string().description('显示名称'),
        preset: z.string().description('别名对应的元数据预设，如 qwen3.8-flash'),
        contextWindow: z.number().step(1).min(1),
        maxTokens: z.number().step(1).min(1),
        input: z.array(z.union(['text', 'image'])),
        thinking: z.boolean().description('非思考模型请关闭'),
        thinkingMode: z.union(['budget', 'effort']),
    })).description('默认 qwen3.8-flash；不要填图片生成、语音或嵌入模型'),
    defaultReasoningEffort: z.union(['off', 'minimal', 'low', 'medium', 'high']).default('high'),
    thinkingMode: z.union(['budget', 'effort']).default('budget').description('预算或强度；一次请求只发送一种参数'),
    thinkingBudgets: z.object({
        minimal: z.number().step(1).min(1), low: z.number().step(1).min(1),
        medium: z.number().step(1).min(1), high: z.number().step(1).min(1),
    }).default({ ...DEFAULT_THINKING_BUDGETS }),
    headers: z.dict(z.string()).description('额外请求头'),
});
