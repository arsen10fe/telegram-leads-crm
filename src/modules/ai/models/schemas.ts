import { z } from "zod";

// What the model must return. Only types, enums and nullable fields go to the model (strict JSON
// schema); business limits are re-applied in code after parsing.

export const SERVICES = ["website", "landing", "telegram_bot", "ads", "smm", "design", "other"] as const;
export const HANDOFF_REASONS = [
  "price_quote",
  "contract_or_payment",
  "complaint",
  "asks_for_human",
  "out_of_scope",
  "unclear",
] as const;

export const QualificationOutput = z.object({
  service: z.enum(SERVICES).describe("Основная услуга; other, если ни одна не подходит"),
  budget: z.string().nullable().describe("Бюджет словами клиента или null, если не назван"),
  urgency: z.enum(["low", "normal", "high"]).nullable(),
  temperature: z.enum(["hot", "warm", "cold"]),
  summary: z.string().describe("Одна строка для менеджера, до 140 символов"),
  suggestedTags: z
    .array(z.object({ name: z.string(), confidence: z.number() }))
    .describe("Только названия из списка доступных тегов, дословно"),
  confidence: z.number().describe("0..1, см. правила калибровки в инструкции"),
});
export type QualificationOutput = z.infer<typeof QualificationOutput>;

export const AutopilotOutput = z.object({
  reply: z.string().describe("Ответ клиенту, 1–4 предложения; пустая строка при handoff"),
  handoff: z.boolean(),
  handoffReason: z.enum(HANDOFF_REASONS).nullable(),
  confidence: z.number(),
  answeredFromKnowledgeBase: z.boolean(),
});
export type AutopilotOutput = z.infer<typeof AutopilotOutput>;

export const DraftOutput = z.object({
  reply: z.string(),
  noteForManager: z.string().nullable(),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function normalizeQualification(output: QualificationOutput): QualificationOutput {
  return {
    ...output,
    summary: output.summary.trim().slice(0, 200),
    budget: output.budget?.trim().slice(0, 100) || null,
    confidence: clamp01(output.confidence),
    suggestedTags: output.suggestedTags.map((tag) => ({ name: tag.name.trim(), confidence: clamp01(tag.confidence) })),
  };
}
