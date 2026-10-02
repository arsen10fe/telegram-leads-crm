import type { Db } from "@/shared/db";

type TagOriginValue = "manual" | "ai" | "rule";

export const leadTagRepository = {
  find(client: Db, leadId: string, tagId: string) {
    return client.leadTag.findUnique({ where: { leadId_tagId: { leadId, tagId } } });
  },

  /** Manual or rule assignment. Re-assigning a dismissed AI tag brings it back as the manager's. */
  assign(client: Db, input: { leadId: string; tagId: string; origin: TagOriginValue; confidence?: number | null }) {
    return client.leadTag.upsert({
      where: { leadId_tagId: { leadId: input.leadId, tagId: input.tagId } },
      create: { leadId: input.leadId, tagId: input.tagId, origin: input.origin, confidence: input.confidence ?? null },
      update: { origin: input.origin, confidence: input.confidence ?? null, dismissedAt: null },
    });
  },

  /**
   * AI assignment: creates only. Never overrides an existing (manual) tag and never resurrects a
   * dismissed one — a dismissed assignment still exists as a row, so it is skipped too.
   */
  createAiIfAbsent(client: Db, input: { leadId: string; tags: Array<{ tagId: string; confidence: number }> }) {
    return client.leadTag.createMany({
      data: input.tags.map((tag) => ({
        leadId: input.leadId,
        tagId: tag.tagId,
        origin: "ai" as const,
        confidence: tag.confidence,
      })),
      skipDuplicates: true,
    });
  },

  delete(client: Db, leadId: string, tagId: string) {
    return client.leadTag.deleteMany({ where: { leadId, tagId } });
  },

  /** The manager removed an AI tag: keep the row as a "do not re-add" marker. */
  dismiss(client: Db, leadId: string, tagId: string, at: Date) {
    return client.leadTag.update({ where: { leadId_tagId: { leadId, tagId } }, data: { dismissedAt: at } });
  },

  listForLead(client: Db, leadId: string) {
    return client.leadTag.findMany({
      where: { leadId },
      include: { tag: true },
      orderBy: [{ createdAt: "asc" }, { tagId: "asc" }],
    });
  },
};
