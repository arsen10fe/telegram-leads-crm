// Manual OpenAI check — never run by tests. Prints status, latency, tokens and the request id;
// never the key.
//   npx tsx --env-file-if-exists=.env scripts/ai-smoke.ts           one structured call (fast model)
//   npx tsx --env-file-if-exists=.env scripts/ai-smoke.ts --models  list GPT models this key can use
import { z } from "zod";
import { createOpenAi, createOpenAiLlmClient } from "@/modules/ai/adapters/openai-llm-client";
import { getEnv } from "@/shared/env";

const write = (line: string) => process.stdout.write(`${line}\n`);

async function listModels(apiKey: string, proxyUrl?: string): Promise<void> {
  const client = createOpenAi({ apiKey, proxyUrl });
  const ids: string[] = [];
  for await (const model of client.models.list()) {
    if (model.id.startsWith("gpt")) ids.push(model.id);
  }
  write(ids.sort().join("\n"));
}

async function smoke(apiKey: string, model: string, proxyUrl?: string): Promise<void> {
  const llm = createOpenAiLlmClient(createOpenAi({ apiKey, proxyUrl }));
  const startedAt = Date.now();
  const result = await llm.generate({
    model,
    system: "Ты проверяешь связь. Ответь по схеме.",
    user: "Скажи «работает» и оцени уверенность.",
    schema: z.object({ answer: z.string(), confidence: z.number() }),
    schemaName: "smoke_check",
    maxOutputTokens: 200,
  });
  if (!result) {
    write(`status: no usable output (refusal or incomplete) · ${Date.now() - startedAt} ms`);
    process.exitCode = 1;
    return;
  }
  write(`status: ok · model ${result.model} · ${result.latencyMs} ms`);
  write(`tokens: in ${result.usage.inputTokens} · out ${result.usage.outputTokens} · cached ${result.usage.cachedTokens}`);
  write(`request id: ${result.requestId ?? "—"}`);
  write(`answer: ${JSON.stringify(result.data)}`);
}

const env = getEnv();
if (!env.OPENAI_API_KEY) {
  write("OPENAI_API_KEY is not set in .env");
  process.exitCode = 1;
} else if (process.argv.includes("--models")) {
  await listModels(env.OPENAI_API_KEY, env.OPENAI_PROXY_URL);
} else {
  await smoke(env.OPENAI_API_KEY, env.OPENAI_MODEL_FAST, env.OPENAI_PROXY_URL);
}
