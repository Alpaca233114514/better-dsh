// dsh-next-suggestion 的 Host 面 Typert 清单(由 @deepseek-ai/dsh-typert-loader
// 自动扫描注册,需要 `exports["./typert"]`)。手写清单,结构与
// @deepseek-ai/dsh-typert-generator 产物一致:`./typert` 导出 TYPERT;
// strict codec 同时提供旧宿主的 schema 和新宿主的 create()。
//
// 终端(TUI/CLI)客户端没有浏览器 composer,无法画灰字;本清单把预测服务
// 暴露成类型化 invocations,让终端/Agent 侧可以查询配置、触发预测并读取结果。
// 服务本体由 index.js 以 `ctx.provide('nextSuggestion', …)` 提供。

import { z } from 'zod'

const REASONING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

const configValuesSchema = z.object({
  cacheTtlMs: z.number().int().min(60000).max(86400000),
  cacheMaxEntries: z.number().int().min(1).max(5000),
  preferredReasoningEffort: z.enum(REASONING_LEVELS),
  fallbackPollMs: z.number().int().min(5000).max(600000),
})

const configSnapshotSchema = z.object({
  values: configValuesSchema,
  editable: z.boolean(),
  fallbackPollMs: z.number().int().min(5000).max(600000),
})

const predictionSchema = z.object({
  // 空字符串表示"本回合没有可用预测"(与 HTTP /predict 一致)。
  text: z.string().max(240),
})

const sessionIdSchema = z.string().min(1).max(512)
const forceSchema = z.boolean().optional()

const fieldSchema = z.enum(['cacheTtlMs', 'cacheMaxEntries', 'preferredReasoningEffort', 'fallbackPollMs'])
const fieldValueSchema = z.union([z.number(), z.string()])

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
})

const predictResultSchema = z.union([predictionSchema, errorSchema])
const updateResultSchema = z.union([configSnapshotSchema, errorSchema])

const strictCodec = (name, schema) => ({
  mode: 'strict',
  typeSymbol: 'dsh-next-suggestion#' + name,
  schema,
  create: () => schema,
})

const _snapshot$codec = strictCodec('ConfigSnapshot', configSnapshotSchema)
const _values$codec = strictCodec('ConfigValues', configValuesSchema)
const _prediction$codec = strictCodec('Prediction', predictionSchema)
const _predictResult$codec = strictCodec('PredictResult', predictResultSchema)
const _updateResult$codec = strictCodec('UpdateResult', updateResultSchema)
const _sessionId$codec = strictCodec('SessionId', sessionIdSchema)
const _force$codec = strictCodec('Force', forceSchema)
const _field$codec = strictCodec('ConfigField', fieldSchema)
const _fieldValue$codec = strictCodec('ConfigFieldValue', fieldValueSchema)

export const TYPERT = {
  package: 'dsh-next-suggestion',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: 'dsh-next-suggestion#nextSuggestion/getConfig',
      service: 'nextSuggestion',
      namespace: 'nextSuggestion',
      method: 'getConfig',
      invocation: { kind: 'direct' },
      parameters: [],
      result: _snapshot$codec,
    },
    {
      id: 'dsh-next-suggestion#nextSuggestion/predict',
      service: 'nextSuggestion',
      namespace: 'nextSuggestion',
      method: 'predict',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', codec: _sessionId$codec },
        { name: 'force', wire: 'force', source: 'json', codec: _force$codec },
      ],
      result: _predictResult$codec,
    },
    {
      id: 'dsh-next-suggestion#nextSuggestion/updateConfig',
      service: 'nextSuggestion',
      namespace: 'nextSuggestion',
      method: 'updateConfig',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'field', wire: 'field', source: 'json', codec: _field$codec },
        { name: 'value', wire: 'value', source: 'json', codec: _fieldValue$codec },
      ],
      result: _updateResult$codec,
    },
  ],
  model: {
    services: [
      {
        description: 'dsh-next-suggestion 预测服务(ctx.nextSuggestion):读取配置、按会话触发下一条消息预测。Next-message prediction service (ctx.nextSuggestion).',
        summary: 'dsh-next-suggestion 预测服务 (dsh-next-suggestion prediction service)。',
        tags: [],
        jsDoc: '/** dsh-next-suggestion 预测服务(ctx.nextSuggestion)。Next-message prediction service (ctx.nextSuggestion). */',
        key: 'nextSuggestion',
        exportName: 'NextSuggestionService',
        members: [
          {
            kind: 'method',
            name: 'getConfig',
            signature: 'getConfig(): ConfigSnapshot',
            summary: '读取当前配置快照与可编辑状态。Read the config snapshot and editability.',
          },
          {
            kind: 'method',
            name: 'predict',
            signature: 'predict(sessionId: string, force?: boolean): Promise<PredictResult>',
            summary: '预测该会话的下一条用户消息;空文本表示无预测。Predict the next user message; empty text means none.',
          },
          {
            kind: 'method',
            name: 'updateConfig',
            signature: 'updateConfig(field: ConfigField, value: number | string): Promise<UpdateResult>',
            summary: '写入一个配置字段(settings 服务落到 profile 补丁)。Write one config field through the settings service.',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}
