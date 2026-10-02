import { settings } from "@/modules/settings";
import { db, type Tx } from "@/shared/db";
import { isUniqueViolation } from "@/shared/errors";
import { enqueue, type JobType } from "@/shared/jobs";
import { createLogger } from "@/shared/logger";
import type { ContactType } from "../models/contact";
import {
  BOT_CHANNEL,
  defaultAiModeFor,
  inboundTime,
  LEAD_REQUEST_MAX_LENGTH,
  newLeadFromInbound,
  type InboundMessage,
  type TelegramUser,
} from "../models/lead";
import { draftRepository } from "../repositories/draft-repository";
import { leadRepository } from "../repositories/lead-repository";
import { messageRepository } from "../repositories/message-repository";

const log = createLogger("leads.ingest");

/** Short delays debounce bursts of messages: the job of an older message sees a newer one and skips. */
const QUALIFY_DELAY_MS = 5_000;
const AUTOPILOT_DELAY_MS = 6_000;
/** After qualification, so the manager's notification already carries AI tags and the summary. */
const NOTIFY_NEW_LEAD_DELAY_MS = 12_000;
const MESSAGE_TEXT_MAX_LENGTH = 4_096;

export type IngestResult =
  | { status: "stored"; leadId: string; messageId: string; isNewLead: boolean }
  | { status: "duplicate" }
  | { status: "no_lead" };

type LeadForJobs = { id: string; aiMode: string; needsHuman: boolean };

/** Side effects of a new client message, written in the same transaction (outbox). */
async function enqueueInboundJobs(tx: Tx, lead: LeadForJobs, messageId: string, isNewLead: boolean): Promise<JobType[]> {
  const types: JobType[] = ["qualify_lead"];
  await enqueue(tx, "qualify_lead", { leadId: lead.id, messageId }, { delayMs: QUALIFY_DELAY_MS });
  if (isNewLead) {
    await enqueue(tx, "notify_new_lead", { leadId: lead.id }, { delayMs: NOTIFY_NEW_LEAD_DELAY_MS });
    types.push("notify_new_lead");
  }
  if (lead.aiMode === "autopilot" && !lead.needsHuman) {
    // No retries: the client is waiting, and a retry after Telegram accepted the reply could send it
    // twice. A failure hands the dialog to a manager instead (see the worker's final-failure handler).
    await enqueue(tx, "autopilot_reply", { leadId: lead.id, messageId }, { delayMs: AUTOPILOT_DELAY_MS, maxAttempts: 1 });
    types.push("autopilot_reply");
  }
  return types;
}

/**
 * Every inbound Telegram message goes through here: persist first (idempotent by Telegram ids),
 * then queue AI and notifications. Nothing here waits for the LLM.
 */
export async function ingestInbound(input: InboundMessage): Promise<IngestResult> {
  const agency = await settings.get();
  const now = new Date();
  const text = input.text.slice(0, MESSAGE_TEXT_MAX_LENGTH);

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await leadRepository.findLatestByChat(tx, input.channelKey, input.chatId);
      if (!existing && !input.createLeadIfMissing) return { status: "no_lead" as const };

      const inboundAt = inboundTime(input.sentAt, now, existing?.lastInboundAt ?? null);
      const lead = existing ?? (await leadRepository.create(tx, newLeadFromInbound(input, agency, inboundAt)));
      const message = await messageRepository.createInbound(tx, lead.id, {
        channelKey: input.channelKey,
        chatId: input.chatId,
        telegramMessageId: input.telegramMessageId,
        text,
      });
      if (existing) {
        await leadRepository.update(tx, lead.id, { lastInboundAt: inboundAt, lastActivityAt: now });
        // Drafts answered the previous message; the client has said something new.
        await draftRepository.supersedePending(tx, lead.id, now);
      }
      const jobTypes = await enqueueInboundJobs(tx, lead, message.id, !existing);
      return { status: "stored" as const, leadId: lead.id, messageId: message.id, isNewLead: !existing, jobTypes };
    });

    if (result.status === "no_lead") return result;
    log.info({ leadId: result.leadId, isNewLead: result.isNewLead, channelKey: input.channelKey }, "inbound stored");
    log.debug({ leadId: result.leadId, types: result.jobTypes }, "jobs enqueued");
    return { status: "stored", leadId: result.leadId, messageId: result.messageId, isNewLead: result.isNewLead };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Telegram re-delivered the update (e.g. after a restart): the message is already stored.
    log.debug(
      { channelKey: input.channelKey, chatId: String(input.chatId), messageId: input.telegramMessageId },
      "duplicate inbound ignored",
    );
    return { status: "duplicate" };
  }
}

export type IntakeSubmission = {
  chatId: bigint;
  telegramMessageId: number;
  from?: TelegramUser;
  name: string;
  contact: string;
  contactType: ContactType;
  request: string;
};

export type SubmitIntakeResult = { status: "stored"; leadId: string; messageId: string } | { status: "duplicate" };

/**
 * Req. 1: the completed bot form. Lead + the request as its first message + jobs commit in one
 * transaction. `inTransaction` lets the caller clear its form state atomically (the form session
 * belongs to the channels module).
 */
export async function submitIntake(
  input: IntakeSubmission,
  hooks: { inTransaction?: (tx: Tx) => Promise<void> } = {},
): Promise<SubmitIntakeResult> {
  const agency = await settings.get();
  const now = new Date();
  const request = input.request.trim().slice(0, LEAD_REQUEST_MAX_LENGTH);

  try {
    const result = await db.$transaction(async (tx) => {
      const lead = await leadRepository.create(tx, {
        name: input.name,
        contact: input.contact,
        contactType: input.contactType,
        request,
        source: "bot",
        channelKey: BOT_CHANNEL,
        telegramChatId: input.chatId,
        telegramUserId: input.from ? BigInt(input.from.id) : null,
        telegramUsername: input.from?.username ?? null,
        aiMode: defaultAiModeFor("bot", agency),
        aiStatus: "pending",
        lastInboundAt: now,
        lastActivityAt: now,
      });
      const message = await messageRepository.createInbound(tx, lead.id, {
        channelKey: BOT_CHANNEL,
        chatId: input.chatId,
        telegramMessageId: input.telegramMessageId,
        text: request,
      });
      await hooks.inTransaction?.(tx);
      const jobTypes = await enqueueInboundJobs(tx, lead, message.id, true);
      return { leadId: lead.id, messageId: message.id, jobTypes };
    });

    log.info({ leadId: result.leadId, chatId: String(input.chatId) }, "intake submitted");
    log.debug({ leadId: result.leadId, types: result.jobTypes }, "jobs enqueued");
    return { status: "stored", leadId: result.leadId, messageId: result.messageId };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    log.debug({ chatId: String(input.chatId), messageId: input.telegramMessageId }, "duplicate intake ignored");
    return { status: "duplicate" };
  }
}
