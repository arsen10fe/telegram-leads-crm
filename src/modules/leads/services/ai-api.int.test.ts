import { describe, expect, it } from "vitest";
import { db } from "@/shared/db";
import { recordOutbound } from "./conversation-service";
import {
  claimDraft,
  createDraft,
  getAiContext,
  handOff,
  releaseDraft,
  saveQualification,
} from "./ai-api-service";
import { ingestInbound } from "./ingest-inbound-service";
import { createTag } from "./tag-service";

async function newLead(): Promise<string> {
  const result = await ingestInbound({
    source: "bot",
    channelKey: "bot",
    chatId: 4242n,
    telegramMessageId: 1,
    text: "Нужен лендинг",
    from: { id: 4242, first_name: "Пётр" },
    createLeadIfMissing: true,
  });
  if (result.status !== "stored") throw new Error("expected a stored lead");
  await db.job.deleteMany();
  return result.leadId;
}

const qualification = {
  service: "landing" as const,
  budget: null,
  urgency: "normal" as const,
  temperature: "warm" as const,
  summary: "Лендинг",
  confidence: 0.8,
  hints: [],
};

describe("AI-facing leads API (integration)", () => {
  it("lets only one of two concurrent claims send a draft", async () => {
    const leadId = await newLead();
    const draft = await createDraft({ leadId, text: "Черновик" });

    const [first, second] = await Promise.all([
      claimDraft({ draftId: draft.id, actorId: null }),
      claimDraft({ draftId: draft.id, actorId: null }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await claimDraft({ draftId: draft.id, actorId: null })).toBeNull();
  });

  it("releases a claimed draft after a failed delivery so it can be sent again", async () => {
    const leadId = await newLead();
    const draft = await createDraft({ leadId, text: "Черновик" });
    await claimDraft({ draftId: draft.id, actorId: null });

    await releaseDraft({ draftId: draft.id });

    expect(await claimDraft({ draftId: draft.id, actorId: null })).not.toBeNull();
  });

  it("does not bring a stale draft back when the client wrote during a failed send", async () => {
    const leadId = await newLead();
    const draft = await createDraft({ leadId, text: "Черновик" });
    await claimDraft({ draftId: draft.id, actorId: null });
    await db.lead.update({ where: { id: leadId }, data: { lastInboundAt: new Date(Date.now() + 1_000) } });

    await releaseDraft({ draftId: draft.id });

    expect((await db.replyDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("superseded");
  });

  it("keeps at most one pending draft per lead", async () => {
    const leadId = await newLead();
    const first = await createDraft({ leadId, text: "Первый" });

    const second = await createDraft({ leadId, text: "Второй" });

    const drafts = await db.replyDraft.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
    expect(drafts.map((d) => [d.id, d.status])).toEqual([
      [first.id, "rejected"],
      [second.id, "pending"],
    ]);
  });

  it("hands off only once: a repeated or late handoff adds no second note or notification", async () => {
    const leadId = await newLead();

    expect(await handOff({ leadId, reason: "trigger" })).toBe(true);
    expect(await handOff({ leadId, reason: "ai_unavailable" })).toBe(false);

    expect(await db.message.count({ where: { leadId, author: "system" } })).toBe(1);
    expect(await db.job.count({ where: { type: "notify_handoff" } })).toBe(1);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).handoffReason).toBe("trigger");
  });

  it("never hands off a lead the manager took out of autopilot", async () => {
    const leadId = await newLead();
    await db.lead.update({ where: { id: leadId }, data: { aiMode: "off" } });

    expect(await handOff({ leadId, reason: "ai_unavailable" })).toBe(false);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).aiMode).toBe("off");
  });

  it("hands off atomically: state, a system note and a manager notification", async () => {
    const leadId = await newLead();

    await handOff({ leadId, reason: "trigger" });

    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead).toMatchObject({ aiMode: "copilot", needsHuman: true, handoffReason: "trigger" });
    expect(lead.handoffAt).not.toBeNull();
    const note = await db.message.findFirstOrThrow({ where: { leadId, author: "system" } });
    expect(note).toMatchObject({ direction: "internal", text: "AI передал диалог менеджеру: стоп-слово в сообщении клиента" });
    expect(await db.job.findMany({ select: { type: true, payload: true } })).toEqual([
      { type: "notify_handoff", payload: { leadId } },
    ]);
  });

  it("saves the qualification and applies AI tags, never touching a tag the manager removed", async () => {
    const leadId = await newLead();
    const landing = await createTag({ name: "Лендинг", color: "sky" });
    const hot = await createTag({ name: "Горячий", color: "red" });
    await db.leadTag.create({ data: { leadId, tagId: hot.id, origin: "ai", dismissedAt: new Date() } });

    await saveQualification({
      leadId,
      qualification,
      aiTags: [
        { tagId: landing.id, confidence: 0.9 },
        { tagId: hot.id, confidence: 0.95 },
      ],
    });

    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { tags: true } });
    expect(lead.aiStatus).toBe("ok");
    expect(lead.qualification).toMatchObject({ temperature: "warm", summary: "Лендинг" });
    const byTag = new Map(lead.tags.map((tag) => [tag.tagId, tag]));
    expect(byTag.get(landing.id)).toMatchObject({ origin: "ai", confidence: 0.9, dismissedAt: null });
    expect(byTag.get(hot.id)?.dismissedAt).not.toBeNull(); // still dismissed
  });

  it("counts failed AI sends as turns, and keeps them out of the prompt context", async () => {
    const leadId = await newLead();
    await recordOutbound({ leadId, author: "ai", text: "Не дошло", deliveryError: "network" });
    await recordOutbound({ leadId, author: "ai", text: "Дошло", telegramMessageId: 2 });

    const context = await getAiContext(leadId);

    expect(context?.aiTurnsLast24h).toBe(2);
    expect(context?.messages.map((m) => [m.author, m.text])).toEqual([
      ["client", "Нужен лендинг"],
      ["ai", "Дошло"],
    ]);
  });
});
