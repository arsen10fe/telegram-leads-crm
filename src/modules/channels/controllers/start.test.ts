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
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  auth: { linkTelegram: vi.fn(), isNotificationChat: vi.fn(async () => false) },
}));
vi.mock("@/modules/leads", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/leads")>();
  return { ...original, leads: { ...original.leads, hasLeadInChat: vi.fn(async () => false) } };
});

import { auth } from "@/modules/auth";
import { leads } from "@/modules/leads";
import { texts } from "../models/bot-texts";
import { createBotHarness, updates } from "../test/bot-harness";

const CHAT = 3003;

describe("/start", () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  it("links a manager's chat for notifications with /start link_<token>", async () => {
    vi.mocked(auth.linkTelegram).mockResolvedValue(true);
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "/start link_abcDEF123-_"));

    expect(auth.linkTelegram).toHaveBeenCalledWith({ token: "abcDEF123-_", chatId: BigInt(CHAT) });
    expect(sentTexts()).toEqual([texts.notificationsLinked]);
    expect(sessions.has(BigInt(CHAT))).toBe(false); // not the form
  });

  it("says the link expired for an unknown token", async () => {
    vi.mocked(auth.linkTelegram).mockResolvedValue(false);
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "/start link_unknown"));

    expect(sentTexts()).toEqual([texts.linkExpired]);
  });

  it("still starts the form on a plain /start", async () => {
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "/start"));

    expect(auth.linkTelegram).not.toHaveBeenCalled();
    expect(sentTexts()).toEqual([texts.greeting("Пиксель и Код")]);
    expect(sessions.get(BigInt(CHAT))).toEqual({ step: "name", data: {} });
  });

  it("does not start a duplicate form when the client already has a lead; /new does (DEF-09)", async () => {
    vi.mocked(leads.hasLeadInChat).mockResolvedValueOnce(true);
    const { send, sentTexts } = createBotHarness();

    await send(updates.text(CHAT, "/start"));
    expect(sentTexts()).toEqual([texts.alreadyHaveRequest]);
    expect(sessions.has(BigInt(CHAT))).toBe(false);

    await send(updates.text(CHAT, "/new"));
    expect(sessions.get(BigInt(CHAT))).toEqual({ step: "name", data: {} });
  });
});
