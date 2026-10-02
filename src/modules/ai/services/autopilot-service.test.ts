import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiContext, AiContextMessage, AutopilotState } from "@/modules/leads";

vi.mock("@/modules/leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/leads")>()),
  leads: { getAiContext: vi.fn(), getAutopilotState: vi.fn(), handOff: vi.fn() },
}));
vi.mock("@/modules/channels", () => ({
  channels: { sendToLead: vi.fn(async () => ({ ok: true, messageId: "m1" })) },
}));
vi.mock("@/modules/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/settings")>()),
  settings: {
    get: vi.fn(async () => ({
      agencyName: "Пиксель и Код",
      knowledgeBase: "Лендинг — от 60 000 ₽",
      triggerWords: ["договор*", "менеджер*"],
      autopilotMaxTurns: 6,
      minConfidence: 0.7,
    })),
  },
}));

import { channels } from "@/modules/channels";
import { leads } from "@/modules/leads";
import { createFakeLlmClient } from "../test/fake-llm-client";
import {
  autopilotStateChanged,
  HANDOFF_TEXT,
  runAutopilot,
  unansweredClientTexts,
  withSignature,
} from "./autopilot-service";

const at = new Date();
const client = (text: string): AiContextMessage => ({ author: "client", text, createdAt: at });

function context(overrides: Partial<AiContext["lead"]> = {}, messages: AiContextMessage[] = [client("Сколько стоит лендинг?")], turns = 0): AiContext {
  return {
    lead: {
      id: "lead_1",
      source: "bot",
      name: "Пётр",
      contact: "+79123456789",
      request: "Лендинг",
      aiMode: "autopilot",
      needsHuman: false,
      channelKey: "bot",
      ...overrides,
    },
    messages,
    tagIds: new Set(),
    dismissedTagIds: new Set(),
    aiTurnsLast24h: turns,
  };
}

const steadyState: AutopilotState = { aiMode: "autopilot", needsHuman: false, lastOutboundAt: null, latestInboundMessageId: "in_1" };

const goodAnswer = {
  autopilot_reply: {
    reply: "Лендинг — от 60 000 ₽. Есть пример, на который ориентируетесь?",
    handoff: false,
    handoffReason: null,
    confidence: 0.92,
    answeredFromKnowledgeBase: true,
  },
};

describe("runAutopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(leads.getAutopilotState).mockResolvedValue(steadyState);
    vi.mocked(leads.handOff).mockResolvedValue(true);
  });

  it("replies when the answer is grounded and confident", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context());
    const llm = createFakeLlmClient(goodAnswer);

    expect(await runAutopilot("lead_1", llm)).toBe("replied");

    expect(channels.sendToLead).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead_1", author: "ai", text: goodAnswer.autopilot_reply.reply }),
    );
    expect(leads.handOff).not.toHaveBeenCalled();
  });

  it("hands off on a trigger word without calling the LLM, and tells the client with the fixed text", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context({}, [client("Пришлите договор, пожалуйста")]));
    const llm = createFakeLlmClient(goodAnswer);

    expect(await runAutopilot("lead_1", llm)).toBe("handed_off");

    expect(llm.calls).toHaveLength(0);
    expect(leads.handOff).toHaveBeenCalledWith({ leadId: "lead_1", reason: "trigger" });
    expect(channels.sendToLead).toHaveBeenCalledWith(expect.objectContaining({ text: HANDOFF_TEXT, author: "ai" }));
  });

  it("hands off on low confidence", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context({}, [client("А игры вы делаете?")]));
    const llm = createFakeLlmClient({ autopilot_reply: { ...goodAnswer.autopilot_reply, confidence: 0.3 } });

    expect(await runAutopilot("lead_1", llm)).toBe("handed_off");
    expect(leads.handOff).toHaveBeenCalledWith({ leadId: "lead_1", reason: "low_confidence" });
  });

  it("hands off when the model fails, without retrying", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context());
    const llm = createFakeLlmClient({ autopilot_reply: new Error("timeout") });

    expect(await runAutopilot("lead_1", llm)).toBe("handed_off");
    expect(leads.handOff).toHaveBeenCalledWith({ leadId: "lead_1", reason: "ai_unavailable" });
  });

  it("hands off when AI is switched off: the client is never left without an answer", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context());

    expect(await runAutopilot("lead_1", null)).toBe("handed_off");

    expect(leads.handOff).toHaveBeenCalledWith({ leadId: "lead_1", reason: "ai_unavailable" });
    expect(channels.sendToLead).toHaveBeenCalledWith(expect.objectContaining({ text: HANDOFF_TEXT }));
  });

  it("hands off when the reply cannot be delivered, without a second send attempt", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context());
    vi.mocked(channels.sendToLead).mockResolvedValueOnce({ ok: false, reason: "blocked" });

    expect(await runAutopilot("lead_1", createFakeLlmClient(goodAnswer))).toBe("handed_off");

    expect(leads.handOff).toHaveBeenCalledWith({ leadId: "lead_1", reason: "send_failed" });
    expect(channels.sendToLead).toHaveBeenCalledTimes(1);
  });

  it("hands off at the daily turn cap without calling the LLM", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context({}, undefined, 6));
    const llm = createFakeLlmClient(goodAnswer);

    expect(await runAutopilot("lead_1", llm)).toBe("handed_off");
    expect(llm.calls).toHaveLength(0);
    expect(leads.handOff).toHaveBeenCalledWith({ leadId: "lead_1", reason: "turn_cap" });
  });

  it("does not answer a message a manager already answered", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(
      context({}, [client("Сколько стоит?"), { author: "manager", text: "От 60 000 ₽", createdAt: at }]),
    );
    const llm = createFakeLlmClient(goodAnswer);

    expect(await runAutopilot("lead_1", llm)).toBe("skipped");
    expect(llm.calls).toHaveLength(0);
  });

  it("drops its answer when a human replied or took over while the model was thinking", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context());
    vi.mocked(leads.getAutopilotState)
      .mockResolvedValueOnce(steadyState)
      .mockResolvedValueOnce({ ...steadyState, lastOutboundAt: new Date() });

    expect(await runAutopilot("lead_1", createFakeLlmClient(goodAnswer))).toBe("skipped");

    expect(channels.sendToLead).not.toHaveBeenCalled();
    expect(leads.handOff).not.toHaveBeenCalled();
  });

  it("does not notify the client again when the lead was already handed off", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context({}, [client("Пришлите договор")]));
    vi.mocked(leads.handOff).mockResolvedValue(false);

    expect(await runAutopilot("lead_1", createFakeLlmClient(goodAnswer))).toBe("skipped");
    expect(channels.sendToLead).not.toHaveBeenCalled();
  });

  it.each([
    ["not in autopilot", { aiMode: "copilot" as const }],
    ["already waiting for a manager", { needsHuman: true }],
    ["without a Telegram chat", { channelKey: null }],
  ])("skips a lead %s", async (_case, overrides) => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context(overrides));
    const llm = createFakeLlmClient(goodAnswer);

    expect(await runAutopilot("lead_1", llm)).toBe("skipped");
    expect(llm.calls).toHaveLength(0);
    expect(channels.sendToLead).not.toHaveBeenCalled();
  });

  it("signs messages sent from a connected personal account", async () => {
    vi.mocked(leads.getAiContext).mockResolvedValue(context({ channelKey: "biz:conn_1", source: "telegram_account" }));

    await runAutopilot("lead_1", createFakeLlmClient(goodAnswer));

    expect(channels.sendToLead).toHaveBeenCalledWith(
      expect.objectContaining({ text: `${goodAnswer.autopilot_reply.reply}\n\n— AI-ассистент Пиксель и Код` }),
    );
  });
});

describe("autopilotStateChanged", () => {
  it.each([
    ["the same state", steadyState, false],
    ["a manager reply", { ...steadyState, lastOutboundAt: new Date() }, true],
    ["a new client message", { ...steadyState, latestInboundMessageId: "in_2" }, true],
    ["a mode switch", { ...steadyState, aiMode: "copilot" as const }, true],
    ["a handoff", { ...steadyState, needsHuman: true }, true],
    ["a deleted lead", null, true],
  ])("%s → %s", (_case, after, expected) => {
    expect(autopilotStateChanged(steadyState, after)).toBe(expected);
  });
});

describe("unansweredClientTexts", () => {
  it("returns the client's messages after the last reply only", () => {
    const messages: AiContextMessage[] = [
      client("Пришлите договор"),
      { author: "manager", text: "Пришлю", createdAt: at },
      client("Спасибо"),
      client("А сроки какие?"),
    ];

    expect(unansweredClientTexts(messages)).toEqual(["Спасибо", "А сроки какие?"]);
  });

  it("falls back to the last client message", () => {
    expect(unansweredClientTexts([client("Привет"), { author: "ai", text: "Здравствуйте", createdAt: at }])).toEqual(["Привет"]);
  });
});

describe("withSignature", () => {
  it("signs only Business chats", () => {
    expect(withSignature("Ответ", "bot", "Пиксель")).toBe("Ответ");
    expect(withSignature("Ответ", "biz:1", "Пиксель")).toBe("Ответ\n\n— AI-ассистент Пиксель");
  });
});
