import { clamp01, type AutopilotOutput } from "./schemas";

// The LLM proposes, these pure functions decide.

export type HandoffReason =
  | "trigger"
  | "turn_cap"
  | "ai_unavailable"
  | "model_requested"
  | "low_confidence"
  | "send_failed";

export type AutopilotDecision = { kind: "reply"; text: string } | { kind: "handoff"; reason: HandoffReason };

const MAX_REPLY_LENGTH = 1_500;

export function decideAutopilot(input: {
  triggerHit: boolean;
  /** null = error, refusal, incomplete output, or the call was skipped. */
  llm: AutopilotOutput | null;
  turnsToday: number;
  maxTurns: number;
  minConfidence: number;
}): AutopilotDecision {
  if (input.triggerHit) return { kind: "handoff", reason: "trigger" };
  if (input.turnsToday >= input.maxTurns) return { kind: "handoff", reason: "turn_cap" };
  if (!input.llm) return { kind: "handoff", reason: "ai_unavailable" };
  if (input.llm.handoff) return { kind: "handoff", reason: "model_requested" };
  const text = input.llm.reply.trim();
  if (!text || clamp01(input.llm.confidence) < input.minConfidence) return { kind: "handoff", reason: "low_confidence" };
  return { kind: "reply", text: text.slice(0, MAX_REPLY_LENGTH) };
}

export type TagPick = { tagId: string; confidence: number };

/** Same normalization as tag names in the CRM: «Тёплый» = «теплый». */
function tagKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase().replaceAll("ё", "е");
}

/**
 * Applies only dictionary tags the lead does not have yet and the manager never removed. Confident
 * ones are applied; the rest become hints the manager can add with one click.
 */
export function pickAiTags(input: {
  suggested: Array<{ name: string; confidence: number }>;
  dictionary: Array<{ id: string; name: string }>;
  dismissedTagIds: ReadonlySet<string>;
  existingTagIds: ReadonlySet<string>;
  threshold: number;
}): { apply: TagPick[]; hints: TagPick[] } {
  const idsByKey = new Map(input.dictionary.map((tag) => [tagKey(tag.name), tag.id]));
  const apply: TagPick[] = [];
  const hints: TagPick[] = [];
  const seen = new Set<string>();
  for (const suggestion of input.suggested) {
    const tagId = idsByKey.get(tagKey(suggestion.name));
    if (!tagId || seen.has(tagId)) continue; // invented by the model, or repeated
    seen.add(tagId);
    if (input.dismissedTagIds.has(tagId) || input.existingTagIds.has(tagId)) continue;
    const confidence = clamp01(suggestion.confidence);
    (confidence >= input.threshold ? apply : hints).push({ tagId, confidence });
  }
  return { apply, hints };
}
