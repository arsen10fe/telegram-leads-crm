import type { AgencySettings, AiModeValue } from "@/modules/settings";
import { telegramContact, type ContactType } from "./contact";

export type LeadSourceValue = "bot" | "telegram_account" | "manual";
export type InboundSource = Exclude<LeadSourceValue, "manual">;

export const BOT_CHANNEL = "bot";
const BUSINESS_CHANNEL_PREFIX = "biz:";

export function businessChannelKey(connectionId: string): string {
  return `${BUSINESS_CHANNEL_PREFIX}${connectionId}`;
}

export type ChannelRef = { kind: "bot" } | { kind: "business"; connectionId: string };

/** "bot" → the bot's own chat; "biz:<id>" → a chat of a connected Telegram Business account. */
export function parseChannelKey(channelKey: string | null | undefined): ChannelRef | null {
  if (!channelKey) return null;
  if (channelKey === BOT_CHANNEL) return { kind: "bot" };
  if (channelKey.startsWith(BUSINESS_CHANNEL_PREFIX) && channelKey.length > BUSINESS_CHANNEL_PREFIX.length) {
    return { kind: "business", connectionId: channelKey.slice(BUSINESS_CHANNEL_PREFIX.length) };
  }
  return null;
}

export type TelegramUser = {
  id: number | bigint;
  first_name?: string;
  last_name?: string;
  username?: string;
};

/** One inbound Telegram message, from any channel, as the ingestion pipeline sees it. */
export type InboundMessage = {
  source: InboundSource;
  channelKey: string;
  chatId: bigint;
  telegramMessageId: number;
  text: string;
  from?: TelegramUser;
  /** When Telegram received the message (message.date). The Business reply window counts from it. */
  sentAt?: Date;
  /** false for the bot: a free message without a lead starts the intake form instead. */
  createLeadIfMissing: boolean;
};

/**
 * When the client wrote, as the reply window must see it: Telegram's own timestamp, never in the
 * future, and never moving an existing lead's clock backwards (backlog after downtime).
 */
export function inboundTime(sentAt: Date | undefined, now: Date, previous: Date | null = null): Date {
  const at = sentAt && sentAt.getTime() <= now.getTime() ? sentAt : now;
  return previous && previous.getTime() > at.getTime() ? previous : at;
}

export const LEAD_NAME_MAX_LENGTH = 100;
export const LEAD_CONTACT_MAX_LENGTH = 100;
export const LEAD_REQUEST_MAX_LENGTH = 2_000;
const UNKNOWN_CLIENT_NAME = "Клиент из Telegram";

export function defaultAiModeFor(source: LeadSourceValue, settings: Pick<AgencySettings, "defaultAiModeBot" | "defaultAiModeBusiness">): AiModeValue {
  if (source === "bot") return settings.defaultAiModeBot;
  if (source === "telegram_account") return settings.defaultAiModeBusiness;
  return "off"; // manual leads have no channel to answer through
}

export function displayNameFromTelegram(from: TelegramUser | undefined): string {
  const fullName = [from?.first_name, from?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const name = fullName || (from?.username ? `@${from.username}` : UNKNOWN_CLIENT_NAME);
  return name.slice(0, LEAD_NAME_MAX_LENGTH);
}

export type NewLeadData = {
  name: string;
  contact: string | null;
  contactType: ContactType | null;
  request: string | null;
  source: LeadSourceValue;
  channelKey: string | null;
  telegramChatId: bigint | null;
  telegramUserId: bigint | null;
  telegramUsername: string | null;
  aiMode: AiModeValue;
  aiStatus: "pending";
  lastInboundAt: Date | null;
  lastActivityAt: Date;
};

/** A lead created from the first inbound message of a chat (Telegram Business, or the bot). */
export function newLeadFromInbound(
  input: InboundMessage,
  settings: Pick<AgencySettings, "defaultAiModeBot" | "defaultAiModeBusiness">,
  now: Date,
): NewLeadData {
  const contact = input.from ? telegramContact(input.from) : null;
  return {
    name: displayNameFromTelegram(input.from),
    contact: contact?.value ?? null,
    contactType: contact?.type ?? null,
    request: input.text.trim().slice(0, LEAD_REQUEST_MAX_LENGTH) || null,
    source: input.source,
    channelKey: input.channelKey,
    telegramChatId: input.chatId,
    telegramUserId: input.from ? BigInt(input.from.id) : null,
    telegramUsername: input.from?.username ?? null,
    aiMode: defaultAiModeFor(input.source, settings),
    aiStatus: "pending",
    lastInboundAt: now,
    lastActivityAt: now,
  };
}

/** The client wrote last and nobody has answered yet. */
export function isAwaitingReply(lead: { lastInboundAt: Date | null; lastOutboundAt: Date | null }): boolean {
  if (!lead.lastInboundAt) return false;
  if (!lead.lastOutboundAt) return true;
  return lead.lastInboundAt.getTime() > lead.lastOutboundAt.getTime();
}

/** A clickable Telegram link for the lead, if we know enough about the account. */
export function telegramLinkFor(lead: { telegramUsername: string | null; telegramUserId: bigint | string | null }): string | null {
  if (lead.telegramUsername) return `https://t.me/${lead.telegramUsername}`;
  if (lead.telegramUserId) return `tg://user?id=${lead.telegramUserId}`;
  return null;
}
