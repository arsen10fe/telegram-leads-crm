import { describe, expect, it } from "vitest";
import {
  businessChannelKey,
  defaultAiModeFor,
  displayNameFromTelegram,
  inboundTime,
  isAwaitingReply,
  newLeadFromInbound,
  parseChannelKey,
  telegramLinkFor,
} from "./lead";

const settings = { defaultAiModeBot: "autopilot", defaultAiModeBusiness: "copilot" } as const;

describe("defaultAiModeFor", () => {
  it("uses the configured default per source and never answers manual leads", () => {
    expect(defaultAiModeFor("bot", settings)).toBe("autopilot");
    expect(defaultAiModeFor("telegram_account", settings)).toBe("copilot");
    expect(defaultAiModeFor("manual", settings)).toBe("off");
  });
});

describe("newLeadFromInbound", () => {
  const now = new Date("2026-10-02T10:00:00Z");

  it("takes the name and contact from the Telegram profile", () => {
    const lead = newLeadFromInbound(
      {
        source: "telegram_account",
        channelKey: businessChannelKey("conn_1"),
        chatId: 555n,
        telegramMessageId: 1,
        text: "  Нужен сайт  ",
        from: { id: 555, first_name: "Анна", last_name: "Смирнова", username: "anna_s" },
        createLeadIfMissing: true,
      },
      settings,
      now,
    );

    expect(lead).toMatchObject({
      name: "Анна Смирнова",
      contact: "@anna_s",
      contactType: "telegram",
      request: "Нужен сайт",
      source: "telegram_account",
      channelKey: "biz:conn_1",
      telegramChatId: 555n,
      telegramUserId: 555n,
      aiMode: "copilot",
      lastInboundAt: now,
      lastActivityAt: now,
    });
  });

  it("falls back to a tg:// link when the user has no username", () => {
    const lead = newLeadFromInbound(
      {
        source: "bot",
        channelKey: "bot",
        chatId: 7n,
        telegramMessageId: 1,
        text: "Привет",
        from: { id: 7, first_name: "Олег" },
        createLeadIfMissing: true,
      },
      settings,
      now,
    );

    expect(lead.contact).toBe("tg://user?id=7");
    expect(lead.aiMode).toBe("autopilot");
  });
});

describe("displayNameFromTelegram", () => {
  it.each([
    [{ id: 1, first_name: "Пётр" }, "Пётр"],
    [{ id: 1, first_name: " ", last_name: "Иванов" }, "Иванов"],
    [{ id: 1, username: "petr" }, "@petr"],
    [{ id: 1 }, "Клиент из Telegram"],
    [undefined, "Клиент из Telegram"],
  ])("%j → %s", (from, expected) => {
    expect(displayNameFromTelegram(from)).toBe(expected);
  });
});

describe("parseChannelKey", () => {
  it.each([
    ["bot", { kind: "bot" }],
    ["biz:abc123", { kind: "business", connectionId: "abc123" }],
    ["biz:", null],
    ["email", null],
    [null, null],
  ])("%s", (key, expected) => {
    expect(parseChannelKey(key)).toEqual(expected);
  });
});

describe("isAwaitingReply", () => {
  const earlier = new Date("2026-10-02T10:00:00Z");
  const later = new Date("2026-10-02T11:00:00Z");

  it("is true when the client wrote last", () => {
    expect(isAwaitingReply({ lastInboundAt: later, lastOutboundAt: earlier })).toBe(true);
    expect(isAwaitingReply({ lastInboundAt: earlier, lastOutboundAt: null })).toBe(true);
  });

  it("is false after a reply or without client messages", () => {
    expect(isAwaitingReply({ lastInboundAt: earlier, lastOutboundAt: later })).toBe(false);
    expect(isAwaitingReply({ lastInboundAt: null, lastOutboundAt: null })).toBe(false);
  });
});

describe("inboundTime", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("uses Telegram's timestamp, so backlog after downtime keeps its real time", () => {
    const sentAt = new Date("2026-10-01T09:00:00Z");

    expect(inboundTime(sentAt, now)).toBe(sentAt);
  });

  it("never goes into the future and never moves an existing clock backwards", () => {
    expect(inboundTime(new Date("2026-10-02T13:00:00Z"), now)).toBe(now);
    expect(inboundTime(undefined, now)).toBe(now);
    const previous = new Date("2026-10-02T11:00:00Z");
    expect(inboundTime(new Date("2026-10-02T10:00:00Z"), now, previous)).toBe(previous);
  });
});

describe("telegramLinkFor", () => {
  it("prefers a public username link", () => {
    expect(telegramLinkFor({ telegramUsername: "anna", telegramUserId: 5n })).toBe("https://t.me/anna");
    expect(telegramLinkFor({ telegramUsername: null, telegramUserId: 5n })).toBe("tg://user?id=5");
    expect(telegramLinkFor({ telegramUsername: null, telegramUserId: null })).toBeNull();
  });
});
