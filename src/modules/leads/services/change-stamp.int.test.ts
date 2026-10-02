// Regression tests for PERF-01 (2026-10-02): the CRM pages now refresh only when this stamp
// changes, so every change a manager can see must change it, and nothing else may.
import { describe, expect, it } from "vitest";
import { db } from "@/shared/db";
import { leadRepository } from "../repositories/lead-repository";
import { getChangeStamp } from "./change-stamp-service";
import { assignTag, createManualLead, removeTag, setAiMode } from "./lead-service";
import { createTag, updateTag } from "./tag-service";

async function expectChanged(change: () => Promise<unknown>): Promise<void> {
  const before = await getChangeStamp();
  await change();
  expect(await getChangeStamp()).not.toBe(before);
}

describe("change stamp (integration)", () => {
  it("is stable while nothing changes", async () => {
    await createManualLead({ name: "Тихий клиент" }, null);

    expect(await getChangeStamp()).toBe(await getChangeStamp());
  });

  it("changes on every change the CRM pages show", async () => {
    let leadId = "";
    await expectChanged(async () => {
      ({ leadId } = await createManualLead({ name: "Клиент" }, null));
    });
    await expectChanged(() => setAiMode(leadId, "copilot"));
    // updateMany must bump updatedAt too: the AI handoff goes through it.
    await db.lead.update({ where: { id: leadId }, data: { aiMode: "autopilot" } });
    await expectChanged(() => leadRepository.markHandedOff(db, leadId, "trigger", new Date()));
    await expectChanged(() =>
      db.message.create({ data: { leadId, direction: "inbound", author: "client", text: "Здравствуйте" } }),
    );

    let tagId = "";
    await expectChanged(async () => {
      ({ id: tagId } = await createTag({ name: "Срочно", color: "red" }));
    });
    await expectChanged(() => updateTag(tagId, { name: "Очень срочно" }));
    await expectChanged(() => updateTag(tagId, { color: "blue" }));
    await expectChanged(() => assignTag({ leadId, tagId }));
    await expectChanged(() => removeTag({ leadId, tagId }));

    let draftId = "";
    await expectChanged(async () => {
      ({ id: draftId } = await db.replyDraft.create({ data: { leadId, text: "Черновик" } }));
    });
    await expectChanged(() =>
      db.replyDraft.updateMany({ where: { id: draftId, status: "pending" }, data: { status: "rejected" } }),
    );
  });
});
