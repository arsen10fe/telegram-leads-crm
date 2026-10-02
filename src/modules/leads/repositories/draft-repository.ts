import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/db";

// Every transition is a conditional update: the affected row count tells whether it happened.
export const draftRepository = {
  create(client: Db, input: { leadId: string; text: string; noteForManager?: string | null; meta?: Prisma.InputJsonValue }) {
    return client.replyDraft.create({
      data: { leadId: input.leadId, text: input.text, noteForManager: input.noteForManager ?? null, meta: input.meta },
    });
  },

  findById(client: Db, id: string) {
    return client.replyDraft.findUnique({ where: { id } });
  },

  findLatest(client: Db, leadId: string) {
    return client.replyDraft.findFirst({ where: { leadId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  },

  findLatestPending(client: Db, leadId: string) {
    return client.replyDraft.findFirst({
      where: { leadId, status: "pending" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  /** pending → sent. Exactly one concurrent caller gets count 1. */
  async claim(client: Db, draftId: string, actorId: string | null, at: Date): Promise<boolean> {
    const { count } = await client.replyDraft.updateMany({
      where: { id: draftId, status: "pending" },
      data: { status: "sent", decidedAt: at, decidedById: actorId },
    });
    return count === 1;
  },

  /** sent → superseded: the delivery failed and the client has written since the draft was made. */
  async supersedeSent(client: Db, draftId: string, at: Date): Promise<boolean> {
    const { count } = await client.replyDraft.updateMany({
      where: { id: draftId, status: "sent" },
      data: { status: "superseded", decidedAt: at },
    });
    return count === 1;
  },

  /** sent → pending, after the delivery failed. */
  async release(client: Db, draftId: string): Promise<boolean> {
    const { count } = await client.replyDraft.updateMany({
      where: { id: draftId, status: "sent" },
      data: { status: "pending", decidedAt: null, decidedById: null },
    });
    return count === 1;
  },

  async reject(client: Db, draftId: string, actorId: string | null, at: Date): Promise<boolean> {
    const { count } = await client.replyDraft.updateMany({
      where: { id: draftId, status: "pending" },
      data: { status: "rejected", decidedAt: at, decidedById: actorId },
    });
    return count === 1;
  },

  async rejectPendingForLead(client: Db, leadId: string, at: Date): Promise<number> {
    const { count } = await client.replyDraft.updateMany({
      where: { leadId, status: "pending" },
      data: { status: "rejected", decidedAt: at },
    });
    return count;
  },

  /** The client wrote again: pending drafts no longer answer the latest message. */
  async supersedePending(client: Db, leadId: string, at: Date): Promise<number> {
    const { count } = await client.replyDraft.updateMany({
      where: { leadId, status: "pending" },
      data: { status: "superseded", decidedAt: at },
    });
    return count;
  },
};
