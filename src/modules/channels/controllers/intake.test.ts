import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntakeData, IntakeStep } from "../models/intake-form";

const sessions = vi.hoisted(() => new Map<bigint, { step: IntakeStep; data: IntakeData }>());

vi.mock("../repositories/intake-session-repository", () => ({
  intakeSessionRepository: {
    findActive: vi.fn(async (chatId: bigint) => sessions.get(chatId) ?? null),
    save: vi.fn(async (chatId: bigint, step: IntakeStep, data: IntakeData) => {
      sessions.set(chatId, { step, data });
    }),
    delete: vi.fn(async (chatId: bigint) => {
      sessions.delete(chatId);
    }),
  },
}));

vi.mock("@/modules/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/settings")>()),
  settings: { get: vi.fn(async () => ({ agencyName: "Пиксель и Код" })) },
}));

vi.mock("@/modules/leads", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/leads")>();
  return {
    ...original,
    leads: {
      ingestInbound: vi.fn(async () => ({ status: "no_lead" })),
      // Runs the caller's in-transaction hook, like the real service does.
      submitIntake: vi.fn(async (_input: unknown, hooks?: { inTransaction?: (tx: never) => Promise<void> }) => {
        await hooks?.inTransaction?.({} as never);
        return { status: "stored", leadId: "lead_1", messageId: "message_1" };
      }),
    },
  };
});

import { leads } from "@/modules/leads";
import { texts } from "../models/bot-texts";
import { createBotHarness, updates } from "../test/bot-harness";

const CHAT = 1001;

describe("intake form (bot)", () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  it("collects name → contact → request and submits exactly once with a normalized phone", async () => {
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Пётр"));
    await send(updates.text(CHAT, "8 (912) 345-67-89"));
    await send(updates.text(CHAT, "Нужен лендинг для кофейни, бюджет 100к"));

    expect(leads.submitIntake).toHaveBeenCalledTimes(1);
    expect(leads.submitIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: BigInt(CHAT),
        name: "Пётр",
        contact: "+79123456789",
        contactType: "phone",
        request: "Нужен лендинг для кофейни, бюджет 100к",
      }),
      expect.anything(),
    );
    expect(sentTexts()).toEqual([
      texts.greeting("Пиксель и Код"),
      texts.ask("contact"),
      texts.ask("request"),
      texts.submitted("Пётр"),
    ]);
    expect(sessions.has(BigInt(CHAT))).toBe(false);
  });

  it("re-asks for an invalid contact and stays on the contact step", async () => {
    const { send, sentTexts } = createBotHarness();
    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Пётр"));

    await send(updates.text(CHAT, "позвоните завтра"));

    expect(sentTexts().at(-1)).toBe(texts.retry("contact", "invalid"));
    expect(sessions.get(BigInt(CHAT))?.step).toBe("contact");
  });

  it("accepts a phone shared with the keyboard button", async () => {
    const { send } = createBotHarness();
    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Пётр"));

    await send(updates.contact(CHAT, "79123456789"));

    expect(sessions.get(BigInt(CHAT))).toEqual({
      step: "request",
      data: { name: "Пётр", contact: "+79123456789", contactType: "phone" },
    });
  });

  it("uses the Telegram username for the «write in Telegram» button", async () => {
    const { send } = createBotHarness();
    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Пётр"));

    await send(updates.text(CHAT, texts.useTelegramButton));

    expect(sessions.get(BigInt(CHAT))?.data).toMatchObject({ contact: "@petr_test", contactType: "telegram" });
  });

  it("re-asks for text when a photo arrives at the request step", async () => {
    const { send, sentTexts } = createBotHarness();
    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Пётр"));
    await send(updates.text(CHAT, "@petr_test"));

    await send(updates.photo(CHAT));

    expect(sentTexts().at(-1)).toBe(texts.retry("request", "unsupported"));
    expect(leads.submitIntake).not.toHaveBeenCalled();
  });

  it("restarts the form on /start in the middle", async () => {
    const { send, sentTexts } = createBotHarness();
    await send(updates.text(CHAT, "/start"));
    await send(updates.text(CHAT, "Пётр"));

    await send(updates.text(CHAT, "/start"));

    expect(sessions.get(BigInt(CHAT))).toEqual({ step: "name", data: {} });
    expect(sentTexts().at(-1)).toBe(texts.greeting("Пиксель и Код"));
  });

  it("cancels the form on /cancel", async () => {
    const { send, sentTexts } = createBotHarness();
    await send(updates.text(CHAT, "/start"));

    await send(updates.text(CHAT, "/cancel"));

    expect(sessions.has(BigInt(CHAT))).toBe(false);
    expect(sentTexts().at(-1)).toBe(texts.cancelled);
  });

  it("greets a free message from a chat without a lead and starts the form", async () => {
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "Здравствуйте, сколько стоит сайт?"));

    expect(leads.ingestInbound).toHaveBeenCalledWith(
      expect.objectContaining({ source: "bot", channelKey: "bot", createLeadIfMissing: false }),
    );
    expect(sentTexts()).toEqual([texts.greeting("Пиксель и Код")]);
    expect(sessions.get(BigInt(CHAT))?.step).toBe("name");
  });

  it("appends a free message to an existing lead without replying", async () => {
    vi.mocked(leads.ingestInbound).mockResolvedValueOnce({ status: "stored", leadId: "lead_1", messageId: "m", isNewLead: false });
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "И ещё нужен логотип"));

    expect(sentTexts()).toEqual([]);
    expect(sessions.has(BigInt(CHAT))).toBe(false);
  });

  it("stores a photo outside the form as a placeholder message", async () => {
    vi.mocked(leads.ingestInbound).mockResolvedValueOnce({ status: "stored", leadId: "lead_1", messageId: "m", isNewLead: false });
    const { send } = createBotHarness();

    await send(updates.photo(CHAT));

    expect(leads.ingestInbound).toHaveBeenCalledWith(expect.objectContaining({ text: "[фото]" }));
  });

  it("ignores group chats", async () => {
    const { send, calls } = createBotHarness();

    await send(updates.groupText(-100, "/start"));

    expect(calls).toEqual([]);
    expect(leads.ingestInbound).not.toHaveBeenCalled();
  });
});
