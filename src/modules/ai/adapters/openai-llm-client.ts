import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import type { z } from "zod";
import { createLogger } from "@/shared/logger";
import type { LlmClient, LlmRequest, LlmResult } from "./llm-client";

const log = createLogger("ai.llm");

// The SDK defaults are a 10-minute timeout and 2 retries: far too long for a waiting client.
const REQUEST_OPTIONS = { timeout: 20_000, maxRetries: 1 };

export function createOpenAi(options: { apiKey: string; proxyUrl?: string }): OpenAI {
  if (!options.proxyUrl) return new OpenAI({ apiKey: options.apiKey });
  // OpenAI geo-blocks some hosting regions: route through a proxy only when one is configured.
  return new OpenAI({
    apiKey: options.apiKey,
    fetch: undiciFetch as unknown as typeof globalThis.fetch,
    fetchOptions: { dispatcher: new ProxyAgent(options.proxyUrl) },
  });
}

export function createOpenAiLlmClient(client: OpenAI): LlmClient {
  return {
    async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<LlmResult<z.infer<S>> | null> {
      const startedAt = Date.now();
      log.debug(
        { schemaName: request.schemaName, model: request.model, inputChars: request.system.length + request.user.length },
        "llm request",
      );
      try {
        const response = await client.responses.parse(
          {
            model: request.model,
            input: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            text: { format: zodTextFormat(request.schema, request.schemaName) },
            max_output_tokens: request.maxOutputTokens,
            // No temperature: reasoning models may reject it.
          },
          REQUEST_OPTIONS,
        );
        if (response.status !== "completed" || response.output_parsed == null) {
          log.warn(
            { schemaName: request.schemaName, status: response.status, reason: response.incomplete_details?.reason },
            "llm returned no usable output",
          );
          return null; // refusal or truncation → the caller hands off
        }
        const result: LlmResult<z.infer<S>> = {
          data: response.output_parsed as z.infer<S>,
          model: response.model,
          latencyMs: Date.now() - startedAt,
          requestId: response._request_id ?? undefined,
          usage: {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
            cachedTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
          },
        };
        log.info(
          { schemaName: request.schemaName, model: result.model, latencyMs: result.latencyMs, ...result.usage, requestId: result.requestId },
          "llm result",
        );
        return result;
      } catch (error) {
        const status = error instanceof OpenAI.APIError ? error.status : undefined;
        log.error(
          { schemaName: request.schemaName, errorClass: error instanceof Error ? error.name : typeof error, status },
          "llm transport error",
        );
        throw error;
      }
    },
  };
}
