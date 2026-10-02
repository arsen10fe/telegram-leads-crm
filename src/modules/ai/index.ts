import { getEnv } from "@/shared/env";
import { handOffAfterFailure, runAutopilot } from "./services/autopilot-service";
import { suggestReply } from "./services/copilot-service";
import { qualifyLead } from "./services/qualify-lead-service";

/** Public API of the ai module. */
export const ai = {
  /** The kill switch: false → no LLM calls anywhere, the CRM shows «AI выключен». */
  isEnabled: () => getEnv().AI_ENABLED,
  /** Model ids for the settings page. */
  models: () => ({ fast: getEnv().OPENAI_MODEL_FAST, smart: getEnv().OPENAI_MODEL_SMART }),
  qualifyLead,
  suggestReply,
  runAutopilot,
  handOffAfterFailure,
};

export { HANDOFF_TEXT, type AutopilotOutcome } from "./services/autopilot-service";

export { getLlmClient } from "./adapters/get-llm-client";
export type { LlmClient } from "./adapters/llm-client";
export { decideAutopilot, pickAiTags, type AutopilotDecision, type HandoffReason } from "./models/decisions";
export { AutopilotOutput, DraftOutput, QualificationOutput } from "./models/schemas";
export { matchTriggers } from "./models/triggers";
export type { SuggestResult } from "./services/copilot-service";
export { AI_TAG_THRESHOLD, type QualifyOutcome } from "./services/qualify-lead-service";
