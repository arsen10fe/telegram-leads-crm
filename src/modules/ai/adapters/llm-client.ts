import type { z } from "zod";

export type LlmUsage = { inputTokens: number; outputTokens: number; cachedTokens: number };

export type LlmResult<T> = {
  data: T;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
  requestId?: string;
};

export type LlmRequest<S extends z.ZodType> = {
  model: string;
  /** Static, byte-stable prefix (cache-friendly). */
  system: string;
  /** Dynamic lead context with <client_messages>. */
  user: string;
  schema: S;
  schemaName: string;
  maxOutputTokens: number;
};

export interface LlmClient {
  /** null = refusal, incomplete or unparsable output. Throws on transport errors (timeout, 429, 5xx). */
  generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<LlmResult<z.infer<S>> | null>;
}

/** What gets stored in Message.meta / the qualification record for every AI call. */
export function llmMeta(result: LlmResult<unknown>) {
  return {
    model: result.model,
    latencyMs: result.latencyMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: result.usage.cachedTokens,
    ...(result.requestId ? { requestId: result.requestId } : {}),
  };
}
