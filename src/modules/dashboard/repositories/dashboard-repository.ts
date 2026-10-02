import { db } from "@/shared/db";

// Read-only aggregates for the dashboard. Nothing here writes.
export const dashboardRepository = {
  leadsCreatedSince(since: Date) {
    return db.lead.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, source: true } });
  },

  countBySource() {
    return db.lead.groupBy({ by: ["source"], _count: { _all: true } });
  },

  countByAiStatus() {
    return db.lead.groupBy({ by: ["aiStatus"], _count: { _all: true } });
  },

  countNeedsHuman() {
    return db.lead.count({ where: { needsHuman: true } });
  },

  /** The client wrote last and nobody answered: two columns compared, so raw SQL. */
  async countAwaitingReply(): Promise<number> {
    const rows = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM "Lead"
      WHERE "lastInboundAt" IS NOT NULL AND ("lastOutboundAt" IS NULL OR "lastInboundAt" > "lastOutboundAt")
    `;
    return Number(rows[0]?.count ?? 0);
  },

  async topTags(limit: number) {
    const groups = await db.leadTag.groupBy({
      by: ["tagId"],
      where: { dismissedAt: null },
      _count: { tagId: true },
      orderBy: { _count: { tagId: "desc" } },
      take: limit,
    });
    const tags = await db.tag.findMany({ where: { id: { in: groups.map((group) => group.tagId) } } });
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    return groups.flatMap((group) => {
      const tag = byId.get(group.tagId);
      return tag ? [{ id: tag.id, name: tag.name, color: tag.color, count: group._count.tagId }] : [];
    });
  },

  countAutopilotReplies() {
    return db.message.count({
      where: { author: "ai", direction: "outbound", deliveryError: null, meta: { path: ["kind"], equals: "autopilot" } },
    });
  },

  async handoffsByReason(): Promise<Array<{ reason: string; count: number }>> {
    const rows = await db.$queryRaw<Array<{ reason: string | null; count: bigint }>>`
      SELECT meta->>'reason' AS reason, count(*) AS count FROM "Message"
      WHERE author = 'system' AND meta->>'kind' = 'handoff'
      GROUP BY 1 ORDER BY 2 DESC
    `;
    return rows.map((row) => ({ reason: row.reason ?? "unknown", count: Number(row.count) }));
  },

  countDraftsSent() {
    return db.replyDraft.count({ where: { status: "sent" } });
  },
};
