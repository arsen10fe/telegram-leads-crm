import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/db";

export type InboundRecord = {
  channelKey: string;
  chatId: bigint;
  telegramMessageId: number;
  text: string;
};

export type OutboundRecord = {
  leadId: string;
  author: "manager" | "ai";
  text: string;
  channelKey: string | null;
  chatId: bigint | null;
  telegramMessageId?: number | null;
  deliveryError?: string | null;
  actorId?: string | null;
  meta?: Prisma.InputJsonValue;
};

export const messageRepository = {
  /** The idempotency key (channelKey, chatId, telegramMessageId) makes a re-delivery fail with P2002. */
  createInbound(client: Db, leadId: string, input: InboundRecord) {
    return client.message.create({
      data: {
        leadId,
        direction: "inbound",
        author: "client",
        text: input.text,
        channelKey: input.channelKey,
        telegramChatId: input.chatId,
        telegramMessageId: input.telegramMessageId,
      },
    });
  },

  createOutbound(client: Db, record: OutboundRecord) {
    return client.message.create({
      data: {
        leadId: record.leadId,
        direction: "outbound",
        author: record.author,
        text: record.text,
        channelKey: record.channelKey,
        telegramChatId: record.chatId,
        telegramMessageId: record.telegramMessageId ?? null,
        deliveryError: record.deliveryError ?? null,
        actorId: record.actorId ?? null,
        meta: record.meta,
      },
    });
  },

  /** A note inside the CRM (handoff, mode change). Never sent to the client. */
  createSystem(client: Db, input: { leadId: string; text: string; meta?: Prisma.InputJsonValue }) {
    return client.message.create({
      data: { leadId: input.leadId, direction: "internal", author: "system", text: input.text, meta: input.meta },
    });
  },

  listByLead(client: Db, leadId: string, take?: number) {
    return client.message.findMany({
      where: { leadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
  },

  async latestInboundId(client: Db, leadId: string): Promise<string | null> {
    const message = await client.message.findFirst({
      where: { leadId, direction: "inbound" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    return message?.id ?? null;
  },

  /** AI messages sent (or attempted: failed sends count too) since the given moment. */
  countAiTurnsSince(client: Db, leadId: string, since: Date) {
    return client.message.count({
      where: { leadId, author: "ai", direction: "outbound", createdAt: { gte: since } },
    });
  },
};
