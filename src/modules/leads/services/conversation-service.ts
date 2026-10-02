import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/shared/db";
import { AppError, isUniqueViolation } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import { parseChannelKey, type ChannelRef, type LeadSourceValue } from "../models/lead";
import { readQualification } from "../models/qualification";
import { draftRepository } from "../repositories/draft-repository";
import { leadRepository } from "../repositories/lead-repository";
import { leadTagRepository } from "../repositories/lead-tag-repository";
import { messageRepository } from "../repositories/message-repository";

const log = createLogger("leads.conversation");

export type OutboundInput = {
  leadId: string;
  author: "manager" | "ai";
  text: string;
  /** Set when Telegram accepted the message. */
  telegramMessageId?: number | null;
  /** Set when the delivery failed: the attempt is still shown in the thread, in red. */
  deliveryError?: string | null;
  actorId?: string | null;
  meta?: Prisma.InputJsonValue;
};

/** Stores an outbound message. A delivered message makes the lead no longer «awaiting a reply». */
export async function recordOutbound(input: OutboundInput): Promise<{ messageId: string }> {
  const now = new Date();
  const messageId = await db.$transaction(async (tx) => {
    const lead = await leadRepository.findById(tx, input.leadId);
    if (!lead) throw new AppError("lead_not_found", "Лид не найден", 404);
    const message = await messageRepository.createOutbound(tx, {
      leadId: lead.id,
      author: input.author,
      text: input.text,
      channelKey: lead.channelKey,
      chatId: lead.telegramChatId,
      telegramMessageId: input.telegramMessageId ?? null,
      deliveryError: input.deliveryError ?? null,
      actorId: input.actorId ?? null,
      meta: input.meta,
    });
    if (!input.deliveryError) {
      await leadRepository.update(tx, lead.id, { lastOutboundAt: now, lastActivityAt: now });
    }
    return message.id;
  });
  log.debug({ leadId: input.leadId, author: input.author, delivered: !input.deliveryError }, "outbound recorded");
  return { messageId };
}

export type ManagerMessageInput = {
  channelKey: string;
  chatId: bigint;
  telegramMessageId: number;
  text: string;
  via: "telegram_app";
};

/**
 * The owner of a connected Telegram account answered in the Telegram app itself. Stored as a manager
 * message on the chat's lead; ignored when the chat has no lead (private conversations stay out).
 */
export async function recordManagerMessage(
  input: ManagerMessageInput,
): Promise<{ status: "stored"; leadId: string } | { status: "no_lead" } | { status: "duplicate" }> {
  const now = new Date();
  try {
    const result = await db.$transaction(async (tx) => {
      const lead = await leadRepository.findLatestByChat(tx, input.channelKey, input.chatId);
      if (!lead) return { status: "no_lead" as const };
      await messageRepository.createOutbound(tx, {
        leadId: lead.id,
        author: "manager",
        text: input.text,
        channelKey: input.channelKey,
        chatId: input.chatId,
        telegramMessageId: input.telegramMessageId,
        meta: { via: input.via },
      });
      // The manager answered: the dialog is handled and stale drafts are no longer needed.
      await leadRepository.update(tx, lead.id, { lastOutboundAt: now, lastActivityAt: now, needsHuman: false });
      await draftRepository.supersedePending(tx, lead.id, now);
      return { status: "stored" as const, leadId: lead.id };
    });
    if (result.status === "no_lead") {
      log.warn({ channelKey: input.channelKey, chatId: String(input.chatId) }, "manager message without a lead ignored");
    } else {
      log.info({ leadId: result.leadId, via: input.via }, "manager message recorded");
    }
    return result;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    log.debug({ channelKey: input.channelKey, messageId: input.telegramMessageId }, "duplicate manager message ignored");
    return { status: "duplicate" };
  }
}

export type ChannelTarget = {
  leadId: string;
  channelKey: string;
  channel: ChannelRef;
  chatId: bigint;
  lastInboundAt: Date | null;
};

/** Where to send a reply to this lead; null for leads without a Telegram chat (manual, demo). */
export async function getChannelTarget(leadId: string): Promise<ChannelTarget | null> {
  const lead = await leadRepository.findById(db, leadId);
  if (!lead || !lead.channelKey || lead.telegramChatId === null) return null;
  const channel = parseChannelKey(lead.channelKey);
  if (!channel) return null;
  return {
    leadId: lead.id,
    channelKey: lead.channelKey,
    channel,
    chatId: lead.telegramChatId,
    lastInboundAt: lead.lastInboundAt,
  };
}

export type LeadSummary = {
  id: string;
  name: string;
  contact: string | null;
  source: LeadSourceValue;
  request: string | null;
  tags: string[];
  summary: string | null;
  handoffReason: string | null;
};

/** Compact lead data for manager notifications. */
export async function getLeadSummary(leadId: string): Promise<LeadSummary | null> {
  const lead = await leadRepository.findById(db, leadId);
  if (!lead) return null;
  const assignments = await leadTagRepository.listForLead(db, leadId);
  return {
    id: lead.id,
    name: lead.name,
    contact: lead.contact,
    source: lead.source,
    request: lead.request,
    tags: assignments.filter((a) => a.dismissedAt === null).map((a) => a.tag.name),
    summary: readQualification(lead.qualification)?.summary || null,
    handoffReason: lead.handoffReason,
  };
}
