import { describe, expect, it } from "vitest";
import { db } from "@/shared/db";
import { saveQualification } from "./ai-api-service";
import { assignTag, createManualLead, listLeads, removeTag, setAiMode } from "./lead-service";
import { createTag } from "./tag-service";

async function tags() {
  const site = await createTag({ name: "Сайт", color: "blue" });
  const hot = await createTag({ name: "Горячий", color: "red" });
  const smm = await createTag({ name: "SMM", color: "pink" });
  return { site, hot, smm };
}

describe("lead service (integration)", () => {
  it("creates a manual lead with tags and an AI qualification job in one go", async () => {
    const { site, hot } = await tags();

    const { leadId } = await createManualLead(
      { name: "  Дмитрий  ", contact: "8 (912) 345-67-89", request: "Бот для записи", tagIds: [site.id, hot.id] },
      null,
    );

    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { tags: true } });
    expect(lead).toMatchObject({ name: "Дмитрий", contact: "+79123456789", contactType: "phone", source: "manual", aiMode: "off" });
    expect(lead.tags.map((t) => t.origin)).toEqual(["manual", "manual"]);
    expect(await db.job.findMany({ select: { type: true, payload: true } })).toEqual([
      { type: "qualify_lead", payload: { leadId } },
    ]);
  });

  it("shows a lead with two tags when filtering by either tag, not by an unrelated one", async () => {
    const { site, hot, smm } = await tags();
    const { leadId } = await createManualLead({ name: "Анна", tagIds: [site.id, hot.id] }, null);
    await createManualLead({ name: "Без тегов" }, null);

    expect((await listLeads({ tagIds: [site.id] })).map((l) => l.id)).toEqual([leadId]);
    expect((await listLeads({ tagIds: [hot.id] })).map((l) => l.id)).toEqual([leadId]);
    expect((await listLeads({ tagIds: [site.id, smm.id] })).map((l) => l.id)).toEqual([leadId]);
    expect(await listLeads({ tagIds: [smm.id] })).toEqual([]);
  });

  it("dismisses a removed AI tag instead of deleting it, and hides it from the list filter", async () => {
    const { site } = await tags();
    const { leadId } = await createManualLead({ name: "Олег" }, null);
    await db.leadTag.create({ data: { leadId, tagId: site.id, origin: "ai", confidence: 0.9 } });

    await removeTag({ leadId, tagId: site.id });

    const assignment = await db.leadTag.findUniqueOrThrow({ where: { leadId_tagId: { leadId, tagId: site.id } } });
    expect(assignment.dismissedAt).not.toBeNull();
    expect(await listLeads({ tagIds: [site.id] })).toEqual([]);
  });

  it("hides a removed manual tag; re-assigning a dismissed AI tag makes it manual again", async () => {
    const { site, hot } = await tags();
    const { leadId } = await createManualLead({ name: "Мария", tagIds: [hot.id] }, null);
    await db.leadTag.create({ data: { leadId, tagId: site.id, origin: "ai", dismissedAt: new Date() } });

    await removeTag({ leadId, tagId: hot.id });
    await assignTag({ leadId, tagId: site.id });

    const [lead] = await listLeads({});
    expect(lead?.tags.map((tag) => tag.id)).toEqual([site.id]);
    expect(await db.leadTag.findUniqueOrThrow({ where: { leadId_tagId: { leadId, tagId: site.id } } })).toMatchObject({
      origin: "manual",
      dismissedAt: null,
    });
  });

  it("never lets the AI put back a tag the manager removed, whatever its origin (DEF-04)", async () => {
    const { site, hot } = await tags();
    const { leadId } = await createManualLead({ name: "Мария", tagIds: [hot.id] }, null);
    const qualification = {
      service: "website" as const,
      budget: null,
      urgency: "normal" as const,
      temperature: "hot" as const,
      summary: "Сайт",
      confidence: 0.9,
      hints: [],
    };
    // The AI adds «Сайт»; the manager removes it, adds it back, then removes it again.
    await saveQualification({ leadId, qualification, aiTags: [{ tagId: site.id, confidence: 0.9 }] });
    await removeTag({ leadId, tagId: site.id });
    await assignTag({ leadId, tagId: site.id });
    await removeTag({ leadId, tagId: site.id });
    // The manager also removes a tag they had added by hand.
    await removeTag({ leadId, tagId: hot.id });

    // The client writes again: qualification runs and suggests both tags.
    await saveQualification({ leadId, qualification, aiTags: [{ tagId: site.id, confidence: 0.95 }, { tagId: hot.id, confidence: 0.95 }] });

    const [lead] = await listLeads({});
    expect(lead?.tags).toEqual([]);
  });

  it("searches special characters literally and treats ё and е as the same letter (DEF-10)", async () => {
    await createManualLead({ name: "Анна", contact: "@anna_smirnova" }, null);
    await createManualLead({ name: "Борис", contact: "@borisx" }, null);
    await createManualLead({ name: "Артём Котов", contact: "artem@mail.ru" }, null);
    const names = async (q: string) => (await listLeads({ q })).map((lead) => lead.name).sort();

    expect(await names("%")).toEqual([]);
    expect(await names("_")).toEqual(["Анна"]);
    expect(await names("anna_s")).toEqual(["Анна"]);
    expect(await names("\\")).toEqual([]);
    expect(await names("Артем")).toEqual(["Артём Котов"]);
    expect(await names("артём")).toEqual(["Артём Котов"]);
  });

  it("orders the list by last activity, newest first, and flags leads awaiting a reply", async () => {
    const first = await createManualLead({ name: "Первый" }, null);
    const second = await createManualLead({ name: "Второй" }, null);
    await db.lead.update({
      where: { id: first.leadId },
      data: { lastActivityAt: new Date(Date.now() + 60_000), lastInboundAt: new Date(Date.now() + 60_000) },
    });

    const list = await listLeads();

    expect(list.map((l) => l.id)).toEqual([first.leadId, second.leadId]);
    expect(list[0]?.awaitingReply).toBe(true);
    expect(list[1]?.awaitingReply).toBe(false);
  });

  it("searches by name or contact, case-insensitively", async () => {
    const { leadId } = await createManualLead({ name: "Игорь", contact: "@IgorStroy" }, null);
    await createManualLead({ name: "Анна" }, null);

    expect((await listLeads({ q: "игорь" })).map((l) => l.id)).toEqual([leadId]);
    expect((await listLeads({ q: "igorstroy" })).map((l) => l.id)).toEqual([leadId]);
  });

  it("refuses autopilot for a lead without a channel", async () => {
    const { leadId } = await createManualLead({ name: "Без канала" }, null);

    await expect(setAiMode(leadId, "autopilot")).rejects.toMatchObject({ code: "no_channel" });
  });

  it("rejects a duplicate tag name regardless of case and ё", async () => {
    await createTag({ name: "Тёплый", color: "amber" });

    await expect(createTag({ name: " теплый ", color: "red" })).rejects.toMatchObject({ code: "tag_exists" });
  });
});
