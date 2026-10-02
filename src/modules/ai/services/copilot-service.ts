import { leads, type DraftView } from "@/modules/leads";
import { settings } from "@/modules/settings";
import { createLogger, errorInfo } from "@/shared/logger";
import { aiModels, getLlmClient } from "../adapters/get-llm-client";
import { llmMeta, type LlmClient } from "../adapters/llm-client";
import { DraftOutput } from "../models/schemas";
import { COPILOT_SYSTEM } from "../prompts/copilot";
import { renderLeadContext, renderSystem } from "../prompts/render";

const log = createLogger("ai.copilot");

export type SuggestResult =
  | { ok: true; draft: DraftView }
  | { ok: false; reason: "ai_disabled" | "ai_failed" | "client_wrote_again" | "not_found" };

/**
 * A reply draft for the manager, generated when they click «Предложить ответ». Never sent by
 * itself: the manager edits and sends it. Any AI problem means «write the reply manually».
 */
export async function suggestReply(leadId: string, llm: LlmClient | null = getLlmClient()): Promise<SuggestResult> {
  if (!llm) return { ok: false, reason: "ai_disabled" };
  const [context, latestBefore] = await Promise.all([leads.getAiContext(leadId), leads.latestInboundMessageId(leadId)]);
  if (!context) return { ok: false, reason: "not_found" };
  const agency = await settings.get();

  try {
    const result = await llm.generate({
      model: aiModels().smart,
      system: renderSystem(COPILOT_SYSTEM, { agency_name: agency.agencyName, knowledge_base: agency.knowledgeBase }),
      user: renderLeadContext(context),
      schema: DraftOutput,
      schemaName: "reply_draft",
      maxOutputTokens: 600,
    });
    const text = result?.data.reply.trim();
    if (!result || !text) {
      log.warn({ leadId, reason: "no_usable_output" }, "suggest failed");
      return { ok: false, reason: "ai_failed" };
    }
    // The client wrote while the model was thinking: this draft would answer an old message.
    if ((await leads.latestInboundMessageId(leadId)) !== latestBefore) {
      log.info({ leadId }, "suggest discarded: the client wrote again during generation");
      return { ok: false, reason: "client_wrote_again" };
    }
    const draft = await leads.createDraft({
      leadId,
      text: text.slice(0, 4_000),
      noteForManager: result.data.noteForManager?.trim() || null,
      meta: llmMeta(result),
    });
    log.info({ leadId, draftId: draft.id }, "draft created");
    return { ok: true, draft };
  } catch (error) {
    log.warn({ leadId, reason: "transport_error", ...errorInfo(error) }, "suggest failed");
    return { ok: false, reason: "ai_failed" };
  }
}
