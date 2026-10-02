import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessConnectionRecord } from "../models/business-connection";

const connections = vi.hoisted(() => new Map<string, BusinessConnectionRecord>());

vi.mock("../repositories/business-connection-repository", () => ({
  businessConnectionRepository: {
    find: vi.fn(async (id: string) => connections.get(id) ?? null),
    upsert: vi.fn(async (input: Omit<BusinessConnectionRecord, "updatedAt">) => {
      const record = { ...input, updatedAt: new Date() };
      connections.set(input.id, record);
      return record;
    }),
    listRecent: vi.fn(async () => [...connections.values()]),
  },
}));

vi.mock("@/modules/leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/leads")>()),
  leads: {
    ingestInbound: vi.fn(async () => ({ status: "stored", leadId: "lead_1", messageId: "m1", isNewLead: true })),
    recordManagerMessage: vi.fn(async () => ({ status: "stored", leadId: "lead_1" })),
  },
}));

import { leads } from "@/modules/leads";
import { texts } from "../models/bot-texts";
import { createBotHarness, updates } from "../test/bot-harness";

const OWNER = 900;
const CLIENT = 555;

describe("Telegram Business (bot)", () => {
  beforeEach(() => {
    connections.clear();
    vi.clearAllMocks();
  });

  it("stores a new connection and confirms it to the owner once", async () => {
    const { send, calls } = createBotHarness();

    await send(updates.businessConnection("conn_1", OWNER));
    await send(updates.businessConnection("conn_1", OWNER));

    expect(connections.get("conn_1")).toMatchObject({
      ownerUserId: BigInt(OWNER),
      ownerChatId: BigInt(OWNER),
      canReply: true,
      isEnabled: true,
      ownerUsername: "manager_acc",
    });
    const confirmations = calls.filter((call) => call.method === "sendMessage");
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0]?.payload).toMatchObject({ chat_id: OWNER, text: texts.businessConnected });
  });

  it("turns a customer's message into an inbound message that may create a lead", async () => {
    const { send, calls } = createBotHarness();
    await send(updates.businessConnection("conn_1", OWNER));

    await send(updates.businessMessage("conn_1", CLIENT, CLIENT, "Здравствуйте, нужен сайт"));

    expect(leads.ingestInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "telegram_account",
        channelKey: "biz:conn_1",
        chatId: BigInt(CLIENT),
        text: "Здравствуйте, нужен сайт",
        createLeadIfMissing: true,
      }),
    );
    // The controller never answers the client itself.
    expect(calls.filter((call) => call.method === "sendMessage")).toHaveLength(1);
  });

  it("records the owner's own message as a manager message, not a new lead", async () => {
    const { send } = createBotHarness();
    await send(updates.businessConnection("conn_1", OWNER));

    await send(updates.businessMessage("conn_1", CLIENT, OWNER, "Добрый день! Сейчас посчитаем."));

    expect(leads.recordManagerMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channelKey: "biz:conn_1", chatId: BigInt(CLIENT), via: "telegram_app" }),
    );
    expect(leads.ingestInbound).not.toHaveBeenCalled();
  });

  it("ignores messages of a disabled connection", async () => {
    const { send } = createBotHarness();
    await send(updates.businessConnection("conn_1", OWNER, false));

    await send(updates.businessMessage("conn_1", CLIENT, CLIENT, "Привет"));

    expect(leads.ingestInbound).not.toHaveBeenCalled();
  });

  it("ignores echoes of messages the bot sent on the owner's behalf", async () => {
    const { send } = createBotHarness();
    await send(updates.businessConnection("conn_1", OWNER));

    await send(
      updates.businessMessage("conn_1", CLIENT, OWNER, "Ответ из CRM", { sender_business_bot: { id: 42, is_bot: true, first_name: "Lidogram" } }),
    );

    expect(leads.recordManagerMessage).not.toHaveBeenCalled();
    expect(leads.ingestInbound).not.toHaveBeenCalled();
  });

  it("fetches an unknown connection from Telegram once, then handles the message", async () => {
    const { send, calls } = createBotHarness({
      responses: {
        getBusinessConnection: {
          id: "conn_2",
          user: { id: OWNER, is_bot: false, first_name: "Менеджер" },
          user_chat_id: OWNER,
          date: 0,
          rights: { can_reply: true },
          is_enabled: true,
        },
      },
    });

    await send(updates.businessMessage("conn_2", CLIENT, CLIENT, "Сколько стоит лендинг?"));

    expect(calls.map((call) => call.method)).toContain("getBusinessConnection");
    expect(connections.get("conn_2")?.isEnabled).toBe(true);
    expect(leads.ingestInbound).toHaveBeenCalledWith(expect.objectContaining({ channelKey: "biz:conn_2" }));
  });
});
