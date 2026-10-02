// Regression tests for DEF-03 (QA 2026-10-02): a manager's own reply must not leave a stale draft
// that can be sent as a second answer, and must stop the autopilot from answering over them.
import { describe, expect, it } from "vitest";
import { db } from "@/shared/db";
import { createDraft } from "./ai-api-service";
import { recordManagerMessage, recordOutbound } from "./conversation-service";
import { ingestInbound } from "./ingest-inbound-service";

async function autopilotLead(): Promise<string> {
  const result = await ingestInbound({
    source: "bot",
    channelKey: "bot",
    chatId: 5151n,
    telegramMessageId: 1,
    text: "Нужен лендинг",
    from: { id: 5151, first_name: "Пётр" },
    createLeadIfMissing: true,
  });
  if (result.status !== "stored") throw new Error("expected a stored lead");
  await db.job.deleteMany();
  expect((await db.lead.findUniqueOrThrow({ where: { id: result.leadId } })).aiMode).toBe("autopilot");
  return result.leadId;
}

describe("manager replies (integration)", () => {
  it("a delivered CRM reply supersedes pending drafts and pauses the autopilot", async () => {
    const leadId = await autopilotLead();
    const draft = await createDraft({ leadId, text: "Черновик AI" });

    await recordOutbound({ leadId, author: "manager", text: "Ответ менеджера", telegramMessageId: 2 });

    expect((await db.replyDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("superseded");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).aiMode).toBe("copilot");
  });

  it("an undelivered CRM reply changes nothing", async () => {
    const leadId = await autopilotLead();
    const draft = await createDraft({ leadId, text: "Черновик AI" });

    await recordOutbound({ leadId, author: "manager", text: "Не дошло", deliveryError: "network" });

    expect((await db.replyDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("pending");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).aiMode).toBe("autopilot");
  });

  it("an AI reply keeps the autopilot on", async () => {
    const leadId = await autopilotLead();

    await recordOutbound({ leadId, author: "ai", text: "Ответ AI", telegramMessageId: 2 });

    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).aiMode).toBe("autopilot");
  });

  it("an answer typed in the Telegram app pauses the autopilot too", async () => {
    const leadId = await autopilotLead();

    await recordManagerMessage({ channelKey: "bot", chatId: 5151n, telegramMessageId: 3, text: "Ответил в Telegram", via: "telegram_app" });

    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).aiMode).toBe("copilot");
  });
});
