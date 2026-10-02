import { leads } from "@/modules/leads";
import { settings } from "@/modules/settings";
import { createLogger } from "@/shared/logger";
import { aiModels, getLlmClient } from "../adapters/get-llm-client";
import type { LlmClient } from "../adapters/llm-client";
import { pickAiTags } from "../models/decisions";
import { normalizeQualification, QualificationOutput } from "../models/schemas";
import { QUALIFY_SYSTEM } from "../prompts/qualify";
import { renderLeadContext, renderSystem } from "../prompts/render";

const log = createLogger("ai.qualify");

/** AI tags at or above this confidence are applied; lower ones become one-click hints. */
export const AI_TAG_THRESHOLD = 0.6;

export type QualifyOutcome = "qualified" | "failed" | "disabled" | "not_found";

/**
 * Qualifies a lead and applies AI tags from the dictionary. Runs as a background job, never on the
 * lead-creation path. A useless model output marks AI as failed; the lead itself is untouched.
 * Transport errors propagate so the job runner retries.
 */
export async function qualifyLead(leadId: string, llm: LlmClient | null = getLlmClient()): Promise<QualifyOutcome> {
  if (!llm) {
    await leads.setAiStatus(leadId, "disabled");
    return "disabled";
  }
  const context = await leads.getAiContext(leadId);
  if (!context) return "not_found";
  const [agency, dictionary] = await Promise.all([settings.get(), leads.listTags()]);

  const result = await llm.generate({
    model: aiModels().fast,
    system: renderSystem(QUALIFY_SYSTEM, {
      agency_name: agency.agencyName,
      knowledge_base: agency.knowledgeBase,
      tag_names: dictionary.map((tag) => tag.name).join(", "),
    }),
    user: renderLeadContext(context),
    schema: QualificationOutput,
    schemaName: "lead_qualification",
    maxOutputTokens: 400,
  });
  if (!result) {
    await leads.setAiStatus(leadId, "failed");
    log.warn({ leadId }, "qualification failed: no usable model output");
    return "failed";
  }

  const output = normalizeQualification(result.data);
  const { apply, hints } = pickAiTags({
    suggested: output.suggestedTags,
    dictionary,
    dismissedTagIds: context.dismissedTagIds,
    existingTagIds: context.tagIds,
    threshold: AI_TAG_THRESHOLD,
  });
  await leads.saveQualification({
    leadId,
    qualification: {
      service: output.service,
      budget: output.budget,
      urgency: output.urgency,
      temperature: output.temperature,
      summary: output.summary,
      confidence: output.confidence,
      hints: hints.map((hint) => hint.tagId),
      model: result.model,
    },
    aiTags: apply,
  });
  log.info(
    { leadId, temperature: output.temperature, appliedTags: apply.length, hints: hints.length },
    "lead qualified",
  );
  return "qualified";
}
