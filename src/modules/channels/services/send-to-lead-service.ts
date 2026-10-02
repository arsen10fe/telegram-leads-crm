import { GrammyError, HttpError } from "grammy";
import { leads } from "@/modules/leads";
import type { Prisma } from "@/generated/prisma/client";
import { createLogger } from "@/shared/logger";
import { telegramApi } from "../adapters/telegram-api";
import { canReplyInBusinessChat } from "../models/business-connection";
import { businessConnectionRepository } from "../repositories/business-connection-repository";

const log = createLogger("channels.send");

export const MAX_OUTBOUND_LENGTH = 4_000;

export type SendFailure =
  | "empty"
  | "too_long"
  | "no_channel"
  | "business_window_closed"
  | "blocked"
  | "rejected"
  | "network";

export type SendResult = { ok: true; messageId: string } | { ok: false; reason: SendFailure };

export type SendInput = {
  leadId: string;
  text: string;
  author: "manager" | "ai";
  actorId?: string | null;
  meta?: Prisma.InputJsonValue;
};

function classifySendError(error: unknown): SendFailure {
  if (error instanceof GrammyError) return error.error_code === 403 ? "blocked" : "rejected";
  if (error instanceof HttpError) return "network";
  throw error; // a programming error: let it surface
}

/**
 * The only outbound path to a client: resolves the bot chat or the business connection, checks the
 * 24-hour Business window before calling Telegram, sends plain text and records the attempt.
 */
export async function sendToLead(input: SendInput): Promise<SendResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_OUTBOUND_LENGTH) return { ok: false, reason: "too_long" };

  const target = await leads.getChannelTarget(input.leadId);
  if (!target) {
    log.warn({ leadId: input.leadId, reason: "no_channel" }, "send failed");
    return { ok: false, reason: "no_channel" };
  }

  const businessConnectionId = target.channel.kind === "business" ? target.channel.connectionId : undefined;
  if (businessConnectionId) {
    const connection = await businessConnectionRepository.find(businessConnectionId);
    const canReply = canReplyInBusinessChat(connection, target.lastInboundAt, new Date());
    log.debug({ leadId: input.leadId, lastInboundAt: target.lastInboundAt, canReply }, "business window check");
    if (!canReply) {
      log.warn({ leadId: input.leadId, reason: "business_window_closed" }, "send failed");
      return { ok: false, reason: "business_window_closed" };
    }
  }

  const record = { leadId: input.leadId, author: input.author, text, actorId: input.actorId, meta: input.meta };
  try {
    // Plain text on purpose: no parse_mode, so client or AI text can never break markup.
    const sent = await telegramApi().sendMessage(
      Number(target.chatId),
      text,
      businessConnectionId ? { business_connection_id: businessConnectionId } : {},
    );
    const { messageId } = await leads.recordOutbound({ ...record, telegramMessageId: sent.message_id });
    log.info({ leadId: input.leadId, author: input.author, channelKind: target.channel.kind }, "message sent to lead");
    return { ok: true, messageId };
  } catch (error) {
    const reason = classifySendError(error);
    log.warn({ leadId: input.leadId, reason }, "send failed");
    // The failed attempt stays visible in the thread (in red), with the reason.
    await leads.recordOutbound({ ...record, deliveryError: reason });
    return { ok: false, reason };
  }
}
