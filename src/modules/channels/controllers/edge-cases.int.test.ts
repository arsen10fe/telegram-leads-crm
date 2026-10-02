// Regression tests for the bot edge cases found by QA on 2026-10-02 (DEF-01…DEF-09).
// Real bot + real database; only the Telegram network is captured.
import type { Update } from "grammy/types";
import { describe, expect, it, vi } from "vitest";
import { leads } from "@/modules/leads";
import { db } from "@/shared/db";
import { createBotHarness, updates } from "../test/bot-harness";

const CHAT = 880_001;
let nextId = 60_000;
const client = { id: CHAT, is_bot: false, first_name: "Пётр", username: "petr_test" };
const chat = { id: CHAT, type: "private" as const, first_name: "Пётр" };
const clientMessage = (extra: Record<string, unknown>): Update =>
  ({ update_id: nextId++, message: { message_id: nextId++, date: 0, chat, from: client, ...extra } }) as Update;
const photo = [{ file_id: "f", file_unique_id: "u", width: 1, height: 1 }];

type Send = (update: Update) => Promise<void>;

async function fillForm(send: Send, request = "Нужен сайт для кофейни") {
  await send(updates.text(CHAT, "/start"));
  await send(updates.text(CHAT, "Пётр"));
  await send(updates.text(CHAT, "+79161234567"));
  if (request) await send(updates.text(CHAT, request));
}

async function lastMessageText(): Promise<string> {
  return (await db.message.findFirstOrThrow({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] })).text;
}

describe("bot edge cases (integration)", () => {
  it("DEF-01: a database outage while handling an update does not lose the lead", async () => {
    const { bot, send } = createBotHarness();
    await fillForm(send, "");
    const outage = Object.assign(new Error("Can't reach database server at postgres:5432"), { code: "P1001" });
    const submit = vi.spyOn(leads, "submitIntake").mockRejectedValueOnce(outage);

    // The polling path: grammY's handleUpdates → bot.catch → retry after the database is back.
    const polling = bot as unknown as { handleUpdates(batch: Update[]): Promise<void> };
    await polling.handleUpdates([updates.text(CHAT, "Нужен сайт для кофейни")]);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(await db.lead.count()).toBe(1);
    submit.mockRestore();
  });

  it("DEF-02: a service message (pinned message) is not stored and starts nothing", async () => {
    const { send, sentTexts } = createBotHarness();
    await send(clientMessage({ pinned_message: { message_id: 1, date: 0, chat, text: "старое" } }));
    expect(await db.intakeSession.count()).toBe(0);
    expect(sentTexts()).toEqual([]);

    await fillForm(send);
    const messages = await db.message.count();
    await send(clientMessage({ pinned_message: { message_id: 2, date: 0, chat, text: "старое" } }));
    await send(clientMessage({ message_auto_delete_timer_changed: { message_auto_delete_time: 86_400 } }));
    expect(await db.message.count()).toBe(messages);
  });

  it("DEF-05: a contact card and a location from a known client keep their data", async () => {
    const { send } = createBotHarness();
    await fillForm(send);

    await send(updates.contact(CHAT, "+79990001122"));
    expect(await lastMessageText()).toMatch(/\+?79990001122/);

    await send(clientMessage({ location: { latitude: 55.7558, longitude: 37.6173 } }));
    expect(await lastMessageText()).toMatch(/55\.7558.*37\.6173/);
  });

  it("DEF-05: a photo whose caption describes the task completes the form", async () => {
    const { send } = createBotHarness();
    await fillForm(send, "");
    await send(clientMessage({ photo, caption: "Нужен такой же сайт" }));

    const lead = await db.lead.findFirstOrThrow();
    expect(lead.request).toContain("Нужен такой же сайт");
  });

  it("DEF-07: a manager writing in the linked notification chat does not get the intake form", async () => {
    await db.user.create({ data: { email: "m@qa.local", passwordHash: "x", name: "M", telegramChatId: BigInt(CHAT) } });
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "спасибо, увидел"));

    expect(await db.intakeSession.count()).toBe(0);
    expect(await db.lead.count()).toBe(0);
    expect(sentTexts().join("\n")).not.toContain("Оставьте заявку");
  });

  it("DEF-08: a command at a form step is not taken as the answer", async () => {
    const { send } = createBotHarness();
    await fillForm(send, "");

    await send(updates.text(CHAT, "/help"));
    expect(await db.lead.count()).toBe(0);

    await send(updates.text(CHAT, "Нужен сайт для кофейни"));
    expect((await db.lead.findFirstOrThrow()).request).toBe("Нужен сайт для кофейни");
  });

  it("DEF-09: /start from a client who already has a lead does not duplicate it; /new does", async () => {
    const { send, sentTexts } = createBotHarness();
    await fillForm(send);

    await send(updates.text(CHAT, "/start"));
    expect(await db.intakeSession.count()).toBe(0);
    expect(sentTexts().at(-1)).toContain("/new");

    await send(updates.text(CHAT, "/new"));
    await send(updates.text(CHAT, "Пётр"));
    await send(updates.text(CHAT, "+79161234567"));
    await send(updates.text(CHAT, "Ещё нужен логотип"));
    expect(await db.lead.count()).toBe(2);
  });
});
