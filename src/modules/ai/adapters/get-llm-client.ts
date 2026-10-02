import { getEnv } from "@/shared/env";
import type { LlmClient } from "./llm-client";
import { createOpenAi, createOpenAiLlmClient } from "./openai-llm-client";

let client: LlmClient | null | undefined;

/**
 * The process-wide LLM client; null when the kill switch is off (AI_ENABLED=false) — services then
 * skip AI and the CRM shows «AI выключен». There is no production stub that could answer clients.
 */
export function getLlmClient(): LlmClient | null {
  if (client !== undefined) return client;
  const env = getEnv();
  client =
    env.AI_ENABLED && env.OPENAI_API_KEY
      ? createOpenAiLlmClient(createOpenAi({ apiKey: env.OPENAI_API_KEY, proxyUrl: env.OPENAI_PROXY_URL }))
      : null;
  return client;
}

export function aiModels(): { fast: string; smart: string } {
  const env = getEnv();
  return { fast: env.OPENAI_MODEL_FAST, smart: env.OPENAI_MODEL_SMART };
}
