import { channels } from "@/modules/channels";
import { leads, parseChannelKey, type AiContextMessage, type AutopilotState } from "@/modules/leads";
import { settings } from "@/modules/settings";
import { createLogger, errorInfo } from "@/shared/logger";
import { aiModels, getLlmClient } from "../adapters/get-llm-client";
import { llmMeta, type LlmClient } from "../adapters/llm-client";
import { decideAutopilot, type HandoffReason } from "../models/decisions";
import { AutopilotOutput } from "../models/schemas";
import { matchTriggers } from "../models/triggers";
import { AUTOPILOT_SYSTEM } from "../prompts/autopilot";
import { renderLeadContext, renderSystem } from "../prompts/render";

const log = createLogger("ai.autopilot");

/** Deterministic, never generated: the moment where a wrong word costs the most trust. */
export const HANDOFF_TEXT = "Передал ваш вопрос менеджеру — он ответит здесь же.";

export type AutopilotOutcome = "replied" | "handed_off" | "skipped";

/** The client messages the AI is about to answer: everything after the last reply. */
export function unansweredClientTexts(messages: AiContextMessage[]): string[] {
  const lastReplyIndex = messages.findLastIndex((message) => message.author !== "client");
  const unanswered = messages.slice(lastReplyIndex + 1).filter((message) => message.author === "client");
  if (unanswered.length > 0) return unanswered.map((message) => message.text);
  const lastClient = messages.findLast((message) => message.author === "client");
  return lastClient ? [lastClient.text] : [];
}

/** On a connected personal account the AI signs its messages, so nobody mistakes it for the owner. */
export function withSignature(text: string, channelKey: string | null, agencyName: string): string {
  return parseChannelKey(channelKey)?.kind === "business" ? `${text}\n\n— AI-ассистент ${agencyName}` : text;
}

/**
 * Did a human answer, take over, or did the client write again while the AI was thinking? Then the
 * AI's answer is stale and must not be sent (a newer job, or the manager, handles the dialog).
 */
export function autopilotStateChanged(before: AutopilotState, after: AutopilotState | null): boolean {
  if (!after) return true;
  if (after.aiMode !== "autopilot" || after.needsHuman) return true;
  if (after.latestInboundMessageId !== before.latestInboundMessageId) return true;
  return (after.lastOutboundAt?.getTime() ?? 0) !== (before.lastOutboundAt?.getTime() ?? 0);
}

function skip(leadId: string, reason: string): AutopilotOutcome {
  log.debug({ leadId, reason }, "autopilot guard skip");
  return "skipped";
}

async function handOff(
  leadId: string,
  reason: HandoffReason,
  notice: { channelKey: string | null; agencyName: string },
): Promise<AutopilotOutcome> {
  const handedOff = await leads.handOff({ leadId, reason });
  if (!handedOff) return skip(leadId, "already_handed_off");
  // The fixed notice — unless the failed send is the very reason (it would fail again).
  if (reason !== "send_failed") {
    await channels.sendToLead({
      leadId,
      text: withSignature(HANDOFF_TEXT, notice.channelKey, notice.agencyName),
      author: "ai",
      meta: { kind: "handoff_notice", reason },
    });
  }
  log.info({ leadId, reason }, "handoff");
  return "handed_off";
}

/** The worker's last resort when an autopilot job crashed: a human takes over, the client is told. */
export async function handOffAfterFailure(leadId: string): Promise<AutopilotOutcome> {
  const [context, agency] = await Promise.all([leads.getAiContext(leadId), settings.get()]);
  if (!context) return skip(leadId, "not_found");
  return handOff(leadId, "ai_unavailable", { channelKey: context.lead.channelKey, agencyName: agency.agencyName });
}

/**
 * Answers the client from the knowledge base, or hands the dialog to a manager. The model only
 * proposes; triggers, caps, confidence and errors are decided here, in code. With AI switched off
 * the dialog goes to a manager too: a waiting client is never left in silence.
 */
export async function runAutopilot(leadId: string, llm: LlmClient | null = getLlmClient()): Promise<AutopilotOutcome> {
  const context = await leads.getAiContext(leadId);
  if (!context) return skip(leadId, "not_found");
  if (context.lead.aiMode !== "autopilot") return skip(leadId, "not_autopilot");
  if (context.lead.needsHuman) return skip(leadId, "needs_human");
  if (!parseChannelKey(context.lead.channelKey)) return skip(leadId, "no_channel");
  // Someone (a manager in the CRM or in the Telegram app) already answered the latest message.
  if (context.messages.at(-1)?.author !== "client") return skip(leadId, "already_answered");
  const before = await leads.getAutopilotState(leadId);
  if (!before) return skip(leadId, "not_found");

  const agency = await settings.get();
  const notice = { channelKey: context.lead.channelKey, agencyName: agency.agencyName };
  if (!llm) return handOff(leadId, "ai_unavailable", notice);

  const triggerHit = matchTriggers(unansweredClientTexts(context.messages), agency.triggerWords) !== null;
  let output: AutopilotOutput | null = null;
  let meta: ReturnType<typeof llmMeta> | undefined;
  if (!triggerHit && context.aiTurnsLast24h < agency.autopilotMaxTurns) {
    try {
      const result = await llm.generate({
        model: aiModels().smart,
        system: renderSystem(AUTOPILOT_SYSTEM, { agency_name: agency.agencyName, knowledge_base: agency.knowledgeBase }),
        user: renderLeadContext(context),
        schema: AutopilotOutput,
        schemaName: "autopilot_reply",
        maxOutputTokens: 600,
      });
      output = result?.data ?? null;
      meta = result ? llmMeta(result) : undefined;
    } catch (error) {
      // The client is waiting: no retries, hand off now.
      log.warn({ leadId, ...errorInfo(error) }, "autopilot llm call failed");
    }
  }

  const decision = decideAutopilot({
    triggerHit,
    llm: output,
    turnsToday: context.aiTurnsLast24h,
    maxTurns: agency.autopilotMaxTurns,
    minConfidence: agency.minConfidence,
  });
  if (autopilotStateChanged(before, await leads.getAutopilotState(leadId))) return skip(leadId, "state_changed");
  if (decision.kind === "handoff") return handOff(leadId, decision.reason, notice);

  const sent = await channels.sendToLead({
    leadId,
    text: withSignature(decision.text, context.lead.channelKey, agency.agencyName),
    author: "ai",
    meta: { kind: "autopilot", confidence: output?.confidence ?? null, ...meta },
  });
  if (!sent.ok) return handOff(leadId, "send_failed", notice);

  log.info({ leadId, confidence: output?.confidence, latencyMs: meta?.latencyMs }, "autopilot replied");
  return "replied";
}
