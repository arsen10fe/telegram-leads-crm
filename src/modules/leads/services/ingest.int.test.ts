import { describe, expect, it } from "vitest";
import { db } from "@/shared/db";
import { isAwaitingReply } from "../models/lead";
import { recordManagerMessage, recordOutbound } from "./conversation-service";
import { ingestInbound, submitIntake } from "./ingest-inbound-service";

const anna = { id: 555, first_name: "Анна", username: "anna_s" };

function businessMessage(telegramMessageId: number, text = "Нужен лендинг") {
  return {
    source: "telegram_account" as const,
    channelKey: "biz:conn_1",
    chatId: 555n,
    telegramMessageId,
    text,
    from: anna,
    createLeadIfMissing: true,
  };
}

async function jobTypes(leadId: string) {
  const jobs = await db.job.findMany({ orderBy: { createdAt: "asc" } });
  return jobs.filter((job) => (job.payload as { leadId?: string }).leadId === leadId).map((job) => job.type);
}

describe("ingestion (integration)", () => {
  it("stores a Telegram message once: a re-delivery is reported as a duplicate", async () => {
    const first = await ingestInbound(businessMessage(10));
    const again = await ingestInbound(businessMessage(10));

    expect(first).toMatchObject({ status: "stored", isNewLead: true });
    expect(again).toEqual({ status: "duplicate" });
    expect(await db.message.count()).toBe(1);
    expect(await db.lead.count()).toBe(1);
  });

  it("creates a Business lead in copilot mode with qualification and notification jobs, no autopilot", async () => {
    const result = await ingestInbound(businessMessage(11));
    if (result.status !== "stored") throw new Error("expected stored");

    const lead = await db.lead.findUniqueOrThrow({ where: { id: result.leadId } });
    expect(lead).toMatchObject({ source: "telegram_account", aiMode: "copilot", name: "Анна", contact: "@anna_s" });
    expect(await jobTypes(result.leadId)).toEqual(["qualify_lead", "notify_new_lead"]);
  });

  it("does not create a bot lead from a free message: the form starts instead", async () => {
    const result = await ingestInbound({
      source: "bot",
      channelKey: "bot",
      chatId: 777n,
      telegramMessageId: 1,
      text: "Привет",
      from: { id: 777, first_name: "Олег" },
      createLeadIfMissing: false,
    });

    expect(result).toEqual({ status: "no_lead" });
    expect(await db.lead.count()).toBe(0);
    expect(await db.job.count()).toBe(0);
  });

  it("appends a follow-up to the chat's lead, bumps activity and supersedes the pending draft", async () => {
    const first = await ingestInbound(businessMessage(20));
    if (first.status !== "stored") throw new Error("expected stored");
    const draft = await db.replyDraft.create({ data: { leadId: first.leadId, text: "Черновик" } });
    const before = await db.lead.findUniqueOrThrow({ where: { id: first.leadId } });

    const second = await ingestInbound(businessMessage(21, "А сроки?"));

    expect(second).toMatchObject({ status: "stored", leadId: first.leadId, isNewLead: false });
    expect((await db.replyDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("superseded");
    const after = await db.lead.findUniqueOrThrow({ where: { id: first.leadId } });
    expect(after.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.lastActivityAt.getTime());
    expect(await db.message.count({ where: { leadId: first.leadId } })).toBe(2);
  });

  it("queues an autopilot reply only for autopilot leads that do not need a human", async () => {
    const submitted = await submitIntake({
      chatId: 1001n,
      telegramMessageId: 5,
      from: { id: 1001, first_name: "Пётр" },
      name: "Пётр",
      contact: "+79123456789",
      contactType: "phone",
      request: "Нужен бот",
    });
    if (submitted.status !== "stored") throw new Error("expected stored");
    expect(await jobTypes(submitted.leadId)).toEqual(["qualify_lead", "notify_new_lead", "autopilot_reply"]);

    await db.lead.update({ where: { id: submitted.leadId }, data: { needsHuman: true } });
    await db.job.deleteMany();
    await ingestInbound({
      source: "bot",
      channelKey: "bot",
      chatId: 1001n,
      telegramMessageId: 6,
      text: "Ау?",
      createLeadIfMissing: false,
    });

    expect(await jobTypes(submitted.leadId)).toEqual(["qualify_lead"]);
  });

  it("submits the intake form atomically: lead, request message, form cleanup and jobs", async () => {
    await db.intakeSession.create({ data: { telegramChatId: 2002n, step: "request", data: {} } });

    const result = await submitIntake(
      {
        chatId: 2002n,
        telegramMessageId: 9,
        name: "Мария",
        contact: "@maria",
        contactType: "telegram",
        request: "  Нужен сайт  ",
      },
      { inTransaction: (tx) => tx.intakeSession.deleteMany({ where: { telegramChatId: 2002n } }).then(() => undefined) },
    );
    if (result.status !== "stored") throw new Error("expected stored");

    const lead = await db.lead.findUniqueOrThrow({ where: { id: result.leadId }, include: { messages: true } });
    expect(lead).toMatchObject({ source: "bot", channelKey: "bot", name: "Мария", request: "Нужен сайт", aiMode: "autopilot" });
    expect(lead.messages.map((m) => m.text)).toEqual(["Нужен сайт"]);
    expect(await db.intakeSession.count()).toBe(0);
  });

  it("rolls everything back when the form cleanup fails", async () => {
    await expect(
      submitIntake(
        { chatId: 3003n, telegramMessageId: 1, name: "Иван", contact: "+79990000000", contactType: "phone", request: "Сайт" },
        { inTransaction: async () => Promise.reject(new Error("cleanup failed")) },
      ),
    ).rejects.toThrow("cleanup failed");

    expect(await db.lead.count()).toBe(0);
    expect(await db.job.count()).toBe(0);
  });

  it("stops awaiting a reply once an outbound message is delivered, but not after a failed one", async () => {
    const result = await ingestInbound(businessMessage(30));
    if (result.status !== "stored") throw new Error("expected stored");

    await recordOutbound({ leadId: result.leadId, author: "manager", text: "Не дошло", deliveryError: "blocked" });
    expect(isAwaitingReply(await db.lead.findUniqueOrThrow({ where: { id: result.leadId } }))).toBe(true);

    await recordOutbound({ leadId: result.leadId, author: "manager", text: "Здравствуйте!", telegramMessageId: 31 });
    expect(isAwaitingReply(await db.lead.findUniqueOrThrow({ where: { id: result.leadId } }))).toBe(false);
  });

  it("records the account owner's own replies on the chat's lead, once, and ignores chats without a lead", async () => {
    const result = await ingestInbound(businessMessage(40));
    if (result.status !== "stored") throw new Error("expected stored");
    const reply = { channelKey: "biz:conn_1", chatId: 555n, telegramMessageId: 41, text: "Добрый день!", via: "telegram_app" as const };

    expect(await recordManagerMessage(reply)).toEqual({ status: "stored", leadId: result.leadId });
    expect(await recordManagerMessage(reply)).toEqual({ status: "duplicate" });
    expect(await recordManagerMessage({ ...reply, chatId: 999n, telegramMessageId: 1 })).toEqual({ status: "no_lead" });

    const lead = await db.lead.findUniqueOrThrow({ where: { id: result.leadId } });
    expect(lead.lastOutboundAt).not.toBeNull();
    expect(await db.message.count({ where: { leadId: result.leadId, author: "manager" } })).toBe(1);
  });
});
