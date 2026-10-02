// Tests only — never wired in production.
import type { z } from "zod";
import type { LlmClient, LlmRequest } from "../adapters/llm-client";

/** Returns fixtures by schema name: an object → parsed result, null → no usable output, Error → thrown. */
export function createFakeLlmClient(bySchema: Record<string, unknown>) {
  const calls: Array<LlmRequest<z.ZodType>> = [];
  const client: LlmClient = {
    async generate(request) {
      calls.push(request);
      const value = bySchema[request.schemaName];
      if (value instanceof Error) throw value;
      if (value === null || value === undefined) return null;
      return {
        data: request.schema.parse(value),
        model: "fake-model",
        latencyMs: 1,
        usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
        requestId: "req_fake",
      };
    },
  };
  return Object.assign(client, { calls });
}
