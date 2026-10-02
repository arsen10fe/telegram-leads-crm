// The path reviewers test first — message to the bot → lead → tag in the CRM — end to end on the
// real database and the real bot. Only the Telegram network is replaced (captured transport).
import { describe, expect, it } from "vitest";
import { leads } from "@/modules/leads";
import { db } from "@/shared/db";
import { texts } from "../models/bot-texts";
import { createBotHarness, updates } from "../test/bot-harness";

const CHAT = 777_001;

describe("mandatory path (integration): bot → lead → tag", () => {
  it("turns the completed form into a lead that can be tagged and found by the tag", async () => {
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "Здравствуйте!"));
    await send(updates.text(CHAT, "Пётр Иванов"));
    await send(updates.text(CHAT, "8 (912) 345-67-89"));
    await send(updates.text(CHAT, "Нужен лендинг для кофейни к ноябрю, бюджет около 80 тысяч"));

    // Requirement 1: the lead appeared by itself, with name, contact and request.
    const lead = await db.lead.findFirstOrThrow({ where: { telegramChatId: BigInt(CHAT) }, include: { messages: true } });
    expect(lead).toMatchObject({
      source: "bot",
      channelKey: "bot",
      name: "Пётр Иванов",
      contact: "+79123456789",
      contactType: "phone",
      request: "Нужен лендинг для кофейни к ноябрю, бюджет около 80 тысяч",
    });
    expect(lead.messages.map((message) => message.text)).toEqual([lead.request]);
    expect(sentTexts().at(-1)).toBe(texts.submitted("Пётр Иванов"));
    // The form is cleared and AI work is queued — nothing waited for the LLM.
    expect(await db.intakeSession.count()).toBe(0);
    expect((await db.job.findMany()).map((job) => job.type).sort()).toEqual(["autopilot_reply", "notify_new_lead", "qualify_lead"]);

    // Requirement 4: tag it and find it by the tag.
    const tag = await leads.createTag({ name: "Лендинг", color: "sky" });
    await leads.assignTag({ leadId: lead.id, tagId: tag.id });
    expect((await leads.listLeads({ tagIds: [tag.id] })).map((item) => item.id)).toEqual([lead.id]);
  });

  it("appends a follow-up message to the same lead instead of creating a new one", async () => {
    const { send } = createBotHarness();
    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Анна"));
    await send(updates.text(CHAT, "@anna_test"));
    await send(updates.text(CHAT, "Нужен Telegram-бот для записи"));

    await send(updates.text(CHAT, "И ещё: интеграция с Google Calendar нужна"));

    const all = await db.lead.findMany({ include: { messages: true } });
    expect(all).toHaveLength(1);
    expect(all[0]?.messages).toHaveLength(2);
    expect(all[0]?.lastInboundAt).not.toBeNull();
  });

  it("ignores a re-delivered update instead of duplicating the lead", async () => {
    const { send } = createBotHarness();
    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Олег"));
    await send(updates.text(CHAT, "oleg@example.com"));
    const finalStep = updates.text(CHAT, "Нужен логотип");

    await send(finalStep);
    await send(finalStep); // Telegram re-delivers after a restart

    expect(await db.lead.count()).toBe(1);
  });
});

describe("Telegram Business (integration)", () => {
  it("creates a lead from a customer's message and records the owner's reply on it", async () => {
    const { send } = createBotHarness();
    const OWNER = 900_001;
    const CUSTOMER = 900_002;

    await send(updates.businessConnection("conn_live", OWNER));
    await send(updates.businessMessage("conn_live", CUSTOMER, CUSTOMER, "Добрый день, ведёте SMM?"));
    await send(updates.businessMessage("conn_live", CUSTOMER, OWNER, "Да, ведём. Расскажите о проекте."));

    const lead = await db.lead.findFirstOrThrow({
      where: { channelKey: "biz:conn_live" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    expect(lead).toMatchObject({ source: "telegram_account", aiMode: "copilot", telegramChatId: BigInt(CUSTOMER) });
    expect(lead.messages.map((message) => [message.author, message.text])).toEqual([
      ["client", "Добрый день, ведёте SMM?"],
      ["manager", "Да, ведём. Расскажите о проекте."],
    ]);
    expect(lead.lastOutboundAt).not.toBeNull();
  });
});
