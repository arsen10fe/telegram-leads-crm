// Composition root of background work: job type → module service.
import { ai } from "@/modules/ai";
import { channels } from "@/modules/channels";
import { leads } from "@/modules/leads";
import type { JobFinalFailureHandlers, JobHandlers } from "@/shared/jobs";
import { createLogger } from "@/shared/logger";

const log = createLogger("worker.jobs");

/** Debounce by superseding: a job for an older message exits when a newer one arrived. */
async function isSuperseded(leadId: string, messageId: string | undefined): Promise<boolean> {
  if (!messageId) return false;
  const latest = await leads.latestInboundMessageId(leadId);
  if (latest === messageId) return false;
  log.debug({ leadId, messageId }, "job superseded by a newer message");
  return true;
}

export const jobHandlers: JobHandlers = {
  async qualify_lead({ leadId, messageId }) {
    if (await isSuperseded(leadId, messageId)) return "skipped_superseded";
    await ai.qualifyLead(leadId);
  },
  async autopilot_reply({ leadId, messageId }) {
    if (await isSuperseded(leadId, messageId)) return "skipped_superseded";
    await ai.runAutopilot(leadId);
  },
  // Only these two notification kinds exist, by the product decision of 2026-10-02.
  notify_new_lead: ({ leadId }) => channels.notifyManagers({ kind: "new_lead", leadId }),
  notify_handoff: ({ leadId }) => channels.notifyManagers({ kind: "handoff", leadId }),
};

export const jobFinalFailureHandlers: JobFinalFailureHandlers = {
  // OpenAI stayed unreachable through every retry: the lead is fine, the AI badge says so.
  qualify_lead: ({ leadId }) => leads.setAiStatus(leadId, "failed"),
  // Any autopilot failure means a human takes over — never silence for a waiting client.
  autopilot_reply: async ({ leadId }) => {
    await ai.handOffAfterFailure(leadId);
  },
};
