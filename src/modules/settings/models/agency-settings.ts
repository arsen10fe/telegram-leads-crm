import { z } from "zod";

export const AI_MODES = ["autopilot", "copilot", "off"] as const;
export type AiModeValue = (typeof AI_MODES)[number];

/**
 * Handoff triggers for the autopilot: "word*" = prefix, "two words" = adjacent words (each may end
 * with *), "word" = exact word. Russian words change their endings, so phrases use prefixes.
 * Price questions are deliberately absent: the autopilot answers "от …" from the knowledge base.
 */
export const DEFAULT_TRIGGER_WORDS = [
  "договор*",
  "оплат*",
  "оплач*",
  "смет*",
  "кп",
  "коммерческ* предложени*",
  "скидк*",
  "менеджер*",
  "оператор*",
  "позвон*",
  "жив* человек*",
  "жалоб*",
  "возврат*",
];

export type AgencySettings = {
  agencyName: string;
  knowledgeBase: string;
  defaultAiModeBot: AiModeValue;
  defaultAiModeBusiness: AiModeValue;
  triggerWords: string[];
  autopilotMaxTurns: number;
  minConfidence: number;
  updatedAt: Date;
};

export type AgencySettingsValues = Omit<AgencySettings, "updatedAt">;

/** Fallback when the settings row is missing. The seed writes the demo agency profile. */
export const DEFAULT_AGENCY_SETTINGS: AgencySettingsValues = {
  agencyName: "Наше агентство",
  knowledgeBase: "",
  defaultAiModeBot: "autopilot",
  defaultAiModeBusiness: "copilot",
  triggerWords: DEFAULT_TRIGGER_WORDS,
  autopilotMaxTurns: 6,
  minConfidence: 0.7,
};

export const KNOWLEDGE_BASE_MAX_LENGTH = 20_000;
export const TRIGGER_WORDS_MAX_COUNT = 50;
export const TRIGGER_WORD_MAX_LENGTH = 40;

/** Case- and ё-insensitive key used to dedupe trigger words. */
function triggerKey(word: string): string {
  return word.toLowerCase().replaceAll("ё", "е");
}

function dedupeTriggerWords(words: string[]): string[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = triggerKey(word);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const TriggerWordsInput = z
  .array(z.string().trim().max(TRIGGER_WORD_MAX_LENGTH, `Не длиннее ${TRIGGER_WORD_MAX_LENGTH} символов`))
  .transform((words) => dedupeTriggerWords(words.filter((word) => word.length > 0)))
  .pipe(z.array(z.string()).max(TRIGGER_WORDS_MAX_COUNT, `Не больше ${TRIGGER_WORDS_MAX_COUNT} слов`));

export const AgencySettingsUpdate = z
  .object({
    agencyName: z.string().trim().min(2, "Минимум 2 символа").max(80, "Не длиннее 80 символов"),
    knowledgeBase: z
      .string()
      .max(KNOWLEDGE_BASE_MAX_LENGTH, `Не длиннее ${KNOWLEDGE_BASE_MAX_LENGTH} символов`),
    defaultAiModeBot: z.enum(AI_MODES),
    defaultAiModeBusiness: z.enum(AI_MODES),
    triggerWords: TriggerWordsInput,
    autopilotMaxTurns: z.number().int().min(1).max(20),
    minConfidence: z.number().min(0).max(1),
  })
  .partial();

export type AgencySettingsUpdate = z.infer<typeof AgencySettingsUpdate>;
