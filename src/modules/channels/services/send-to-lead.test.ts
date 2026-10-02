import { GrammyError, HttpError } from "grammy";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelTarget } from "@/modules/leads";

const sendMessage = vi.hoisted(() => vi.fn());
const findConnection = vi.hoisted(() => vi.fn());

vi.mock("../adapters/telegram-api", () => ({ telegramApi: () => ({ sendMessage }) }));
vi.mock("../repositories/business-connection-repository", () => ({
  businessConnectionRepository: { find: findConnection },
}));
vi.mock("@/modules/leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/leads")>()),
  leads: {
    getChannelTarget: vi.fn(),
    recordOutbound: vi.fn(async () => ({ messageId: "message_1" })),
  },
}));

import { leads } from "@/modules/leads";
import { sendToLead } from "./send-to-lead-service";

const botTarget: ChannelTarget = {
  leadId: "lead_1",
  channelKey: "bot",
  channel: { kind: "bot" },
  chatId: 1001n,
  lastInboundAt: new Date(),
};

const businessTarget = (lastInboundAt: Date): ChannelTarget => ({
  leadId: "lead_1",
  channelKey: "biz:conn_1",
  channel: { kind: "business", connectionId: "conn_1" },
  chatId: 555n,
  lastInboundAt,
});

function forbidden(): GrammyError {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" },
    "sendMessage",
    {},
  );
}

describe("sendToLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findConnection.mockResolvedValue({ isEnabled: true, canReply: true });
  });

  it("sends plain text to the bot chat and records the Telegram message id", async () => {
    vi.mocked(leads.getChannelTarget).mockResolvedValue(botTarget);
    sendMessage.mockResolvedValue({ message_id: 77 });

    const result = await sendToLead({ leadId: "lead_1", text: "  Здравствуйте!  ", author: "manager", actorId: "user_1" });

    expect(result).toEqual({ ok: true, messageId: "message_1" });
    expect(sendMessage).toHaveBeenCalledWith(1001, "Здравствуйте!", {});
    expect(leads.recordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead_1", author: "manager", text: "Здравствуйте!", telegramMessageId: 77, actorId: "user_1" }),
    );
  });

  it("sends on behalf of the business account inside the 24-hour window", async () => {
    vi.mocked(leads.getChannelTarget).mockResolvedValue(businessTarget(new Date(Date.now() - 3_600_000)));
    sendMessage.mockResolvedValue({ message_id: 78 });

    await sendToLead({ leadId: "lead_1", text: "Ответ", author: "manager" });

    expect(sendMessage).toHaveBeenCalledWith(555, "Ответ", { business_connection_id: "conn_1" });
  });

  it("does not call Telegram when the business window is closed", async () => {
    vi.mocked(leads.getChannelTarget).mockResolvedValue(businessTarget(new Date(Date.now() - 25 * 3_600_000)));

    expect(await sendToLead({ leadId: "lead_1", text: "Ответ", author: "manager" })).toEqual({
      ok: false,
      reason: "business_window_closed",
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(leads.recordOutbound).not.toHaveBeenCalled();
  });

  it("maps 403 to «blocked» and keeps the failed attempt in the thread", async () => {
    vi.mocked(leads.getChannelTarget).mockResolvedValue(botTarget);
    sendMessage.mockRejectedValue(forbidden());

    expect(await sendToLead({ leadId: "lead_1", text: "Ответ", author: "ai" })).toEqual({ ok: false, reason: "blocked" });
    expect(leads.recordOutbound).toHaveBeenCalledWith(expect.objectContaining({ deliveryError: "blocked", author: "ai" }));
  });

  it("maps a network failure to «network»", async () => {
    vi.mocked(leads.getChannelTarget).mockResolvedValue(botTarget);
    sendMessage.mockRejectedValue(new HttpError("Network request failed", new Error("ECONNRESET")));

    expect(await sendToLead({ leadId: "lead_1", text: "Ответ", author: "manager" })).toEqual({ ok: false, reason: "network" });
  });

  it("rejects empty and too long texts before touching anything", async () => {
    expect(await sendToLead({ leadId: "lead_1", text: "   ", author: "manager" })).toEqual({ ok: false, reason: "empty" });
    expect(await sendToLead({ leadId: "lead_1", text: "x".repeat(4001), author: "manager" })).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(leads.getChannelTarget).not.toHaveBeenCalled();
  });

  it("reports leads without a Telegram chat", async () => {
    vi.mocked(leads.getChannelTarget).mockResolvedValue(null);

    expect(await sendToLead({ leadId: "lead_1", text: "Ответ", author: "manager" })).toEqual({ ok: false, reason: "no_channel" });
  });
});
