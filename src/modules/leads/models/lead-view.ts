import type { AiModeValue } from "@/modules/settings";
import type { ContactType } from "./contact";
import { isAwaitingReply, parseChannelKey, telegramLinkFor, type ChannelRef, type LeadSourceValue } from "./lead";
import { readQualification, type StoredQualification } from "./qualification";

// Plain data for the web layer: no Prisma types, Telegram ids as strings.

export type TagOriginValue = "manual" | "ai" | "rule";
export type AiStatusValue = "pending" | "ok" | "failed" | "disabled";

export type TagView = { id: string; name: string; color: string };
export type TagWithCount = TagView & { leadCount: number };
export type LeadTagView = TagView & { origin: TagOriginValue; confidence: number | null };

export type LeadListItem = {
  id: string;
  name: string;
  contact: string | null;
  source: LeadSourceValue;
  aiMode: AiModeValue;
  aiStatus: AiStatusValue | null;
  needsHuman: boolean;
  awaitingReply: boolean;
  qualification: StoredQualification | null;
  tags: LeadTagView[];
  lastActivityAt: Date;
  createdAt: Date;
};

export type LeadMessageView = {
  id: string;
  direction: "inbound" | "outbound" | "internal";
  author: "client" | "manager" | "ai" | "system";
  text: string;
  deliveryError: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

export type LeadDetails = LeadListItem & {
  contactType: ContactType | null;
  request: string | null;
  channel: ChannelRef | null;
  telegramUsername: string | null;
  telegramUserId: string | null;
  telegramLink: string | null;
  handoffReason: string | null;
  handoffAt: Date | null;
  qualifiedAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  dismissedTagIds: string[];
  messages: LeadMessageView[];
  /** AI messages to the client in the last 24 h (the autopilot cap counts the same thing). */
  aiRepliesLast24h: number;
};

type TagRow = { id: string; name: string; color: string };
type LeadTagRow = { origin: TagOriginValue; confidence: number | null; dismissedAt: Date | null; tag: TagRow };

type LeadRowBase = {
  id: string;
  name: string;
  contact: string | null;
  source: LeadSourceValue;
  aiMode: AiModeValue;
  aiStatus: AiStatusValue | null;
  needsHuman: boolean;
  qualification: unknown;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  tags: LeadTagRow[];
};

type LeadDetailsRowLike = LeadRowBase & {
  contactType: string | null;
  request: string | null;
  channelKey: string | null;
  telegramUsername: string | null;
  telegramUserId: bigint | null;
  handoffReason: string | null;
  handoffAt: Date | null;
  qualifiedAt: Date | null;
  messages: Array<{
    id: string;
    direction: LeadMessageView["direction"];
    author: LeadMessageView["author"];
    text: string;
    deliveryError: string | null;
    meta: unknown;
    createdAt: Date;
  }>;
};

export function toTagView(tag: TagRow): TagView {
  return { id: tag.id, name: tag.name, color: tag.color };
}

function toLeadTagView(assignment: LeadTagRow): LeadTagView {
  return { ...toTagView(assignment.tag), origin: assignment.origin, confidence: assignment.confidence };
}

function isContactType(value: string | null): value is ContactType {
  return value === "phone" || value === "telegram" || value === "email";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function toLeadListItem(row: LeadRowBase): LeadListItem {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    source: row.source,
    aiMode: row.aiMode,
    aiStatus: row.aiStatus,
    needsHuman: row.needsHuman,
    awaitingReply: isAwaitingReply(row),
    qualification: readQualification(row.qualification),
    tags: row.tags.filter((assignment) => assignment.dismissedAt === null).map(toLeadTagView),
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function toLeadDetails(row: LeadDetailsRowLike, now: Date = new Date()): LeadDetails {
  const since = now.getTime() - DAY_MS;
  return {
    ...toLeadListItem(row),
    contactType: isContactType(row.contactType) ? row.contactType : null,
    request: row.request,
    channel: parseChannelKey(row.channelKey),
    telegramUsername: row.telegramUsername,
    telegramUserId: row.telegramUserId === null ? null : row.telegramUserId.toString(),
    telegramLink: telegramLinkFor(row),
    handoffReason: row.handoffReason,
    handoffAt: row.handoffAt,
    qualifiedAt: row.qualifiedAt,
    lastInboundAt: row.lastInboundAt,
    lastOutboundAt: row.lastOutboundAt,
    dismissedTagIds: row.tags.filter((assignment) => assignment.dismissedAt !== null).map((a) => a.tag.id),
    messages: row.messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      author: message.author,
      text: message.text,
      deliveryError: message.deliveryError,
      meta: asRecord(message.meta),
      createdAt: message.createdAt,
    })),
    aiRepliesLast24h: row.messages.filter(
      (message) => message.author === "ai" && message.direction === "outbound" && message.createdAt.getTime() >= since,
    ).length,
  };
}
