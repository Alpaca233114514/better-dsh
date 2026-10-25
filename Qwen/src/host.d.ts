/**
 * Runtime modules supplied by the DSH host through its profile package
 * resolution. These declarations keep the source type-checkable without
 * installing a second harness runtime into this package.
 */

declare module '@deepseek-ai/dsh-llm-pi-ai' {
  /** Provider-neutral wrapper around pi-ai's adapter; owns transcript conversion and replay. */
  export class PiAiAdapter {
    constructor(options: Record<string, unknown>)
    providerInfo(provider: string): { id: string; name: string }
    providerRetryPolicy(provider: string): unknown
    listModels(provider: string): Promise<readonly unknown[]>
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<Record<string, unknown>>
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<{
      model: Record<string, unknown>
      stream: (options: Record<string, unknown>) => AsyncIterable<Record<string, unknown>>
    }>
    stream(options: Record<string, unknown>): AsyncIterable<Record<string, unknown>>
  }
}

declare module '@deepseek-ai/dsh-llm' {
  /** Structured failure carrying a machine-readable code. */
  export class LlmError extends Error {
    constructor(message: string, code: string, options?: { cause?: unknown })
    readonly code: string
  }
  /** Resolve a provider retry policy with DSH's defaults. */
  export function resolveRetryPolicy(config: unknown, label: string): unknown
  /** Bridge an attachment reference into the current request world. */
  export function resolveImageAttachmentAccess(
    attachments: unknown,
    resolveHostPath: (hostPath: string) => string | undefined,
    ref: unknown,
  ): unknown
}

declare module '@deepseek-ai/dsh-launch-environment' {
  export function launchEnvironmentOf(ctx: unknown): { get(name: string): { value: string } | undefined }
}

declare module '@earendil-works/pi-ai/api/openai-completions' {
  /** Stream one Chat Completions request with pi-ai's normalized events. */
  export function stream(model: unknown, context: unknown, options?: Record<string, unknown>): unknown
  /** Stream one simple (options-only) Chat Completions request. */
  export function streamSimple(model: unknown, context: unknown, options?: Record<string, unknown>): unknown
}
