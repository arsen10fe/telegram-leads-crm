import { z } from "zod";

export const SERVICES = ["website", "landing", "telegram_bot", "ads", "smm", "design", "other"] as const;
export const TEMPERATURES = ["hot", "warm", "cold"] as const;
export const URGENCIES = ["low", "normal", "high"] as const;

export type Temperature = (typeof TEMPERATURES)[number];

/** What is stored in Lead.qualification. Parsed on read: JSON from the database is untrusted. */
export const StoredQualification = z.object({
  service: z.enum(SERVICES).catch("other"),
  budget: z.string().nullable().catch(null),
  urgency: z.enum(URGENCIES).nullable().catch(null),
  temperature: z.enum(TEMPERATURES).catch("warm"),
  summary: z.string().catch(""),
  confidence: z.number().min(0).max(1).catch(0),
  /** Ids of dictionary tags the AI suggested below the confidence threshold (one click to add). */
  hints: z.array(z.string()).catch([]),
  model: z.string().optional(),
});
export type StoredQualification = z.infer<typeof StoredQualification>;

export function readQualification(value: unknown): StoredQualification | null {
  if (value === null || value === undefined) return null;
  const parsed = StoredQualification.safeParse(value);
  return parsed.success ? parsed.data : null;
}
