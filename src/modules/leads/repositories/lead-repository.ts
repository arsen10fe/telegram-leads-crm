import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/db";
import type { LeadSourceValue, NewLeadData } from "../models/lead";

export type LeadListFilters = {
  /** Any-of: a lead matches if it has at least one of these (non-dismissed) tags. */
  tagIds?: string[];
  source?: LeadSourceValue;
  needsHuman?: boolean;
  /** Case-insensitive substring of the name or contact. */
  q?: string;
  limit?: number;
};

const LIST_LIMIT = 100;

// Stable tag order: assignment time, then id (seeded tags share a timestamp).
const tagOrder = [{ createdAt: "asc" }, { tagId: "asc" }] satisfies Prisma.LeadTagOrderByWithRelationInput[];

const listInclude = {
  tags: {
    where: { dismissedAt: null },
    include: { tag: true },
    orderBy: tagOrder,
  },
} satisfies Prisma.LeadInclude;

const detailsInclude = {
  // Dismissed tags are loaded too: the AI must know which ones it may not re-add.
  tags: { include: { tag: true }, orderBy: tagOrder },
  messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.LeadInclude;

export type LeadListRow = Prisma.LeadGetPayload<{ include: typeof listInclude }>;
export type LeadDetailsRow = Prisma.LeadGetPayload<{ include: typeof detailsInclude }>;

function buildListWhere(filters: LeadListFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (filters.tagIds && filters.tagIds.length > 0) {
    where.tags = { some: { tagId: { in: filters.tagIds }, dismissedAt: null } };
  }
  if (filters.source) where.source = filters.source;
  if (filters.needsHuman !== undefined) where.needsHuman = filters.needsHuman;
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { contact: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export const leadRepository = {
  create(client: Db, data: NewLeadData & { createdById?: string | null; createdAt?: Date }) {
    return client.lead.create({ data });
  },

  findById(client: Db, id: string) {
    return client.lead.findUnique({ where: { id } });
  },

  findDetailsById(client: Db, id: string) {
    return client.lead.findUnique({ where: { id }, include: detailsInclude });
  },

  /** Free messages in a chat append to the chat's most recent lead. */
  findLatestByChat(client: Db, channelKey: string, chatId: bigint) {
    return client.lead.findFirst({
      where: { channelKey, telegramChatId: chatId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  list(client: Db, filters: LeadListFilters) {
    return client.lead.findMany({
      where: buildListWhere(filters),
      include: listInclude,
      orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
      take: filters.limit ?? LIST_LIMIT,
    });
  },

  update(client: Db, id: string, data: Prisma.LeadUpdateInput) {
    return client.lead.update({ where: { id }, data });
  },

  /**
   * Conditional handoff: only a lead still in autopilot and not yet with a human. Returns whether
   * it happened, so a repeated or late handoff never duplicates notes and notifications.
   */
  async markHandedOff(client: Db, id: string, reason: string, at: Date): Promise<boolean> {
    const { count } = await client.lead.updateMany({
      where: { id, aiMode: "autopilot", needsHuman: false },
      data: { aiMode: "copilot", needsHuman: true, handoffReason: reason, handoffAt: at },
    });
    return count === 1;
  },
};
