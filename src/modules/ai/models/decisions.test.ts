import { describe, expect, it } from "vitest";
import { decideAutopilot, pickAiTags } from "./decisions";
import type { AutopilotOutput } from "./schemas";

const good: AutopilotOutput = {
  reply: "Лендинг — от 60 000 ₽. Есть пример, на который ориентируетесь?",
  handoff: false,
  handoffReason: null,
  confidence: 0.9,
  answeredFromKnowledgeBase: true,
};
const base = { triggerHit: false, llm: good, turnsToday: 0, maxTurns: 6, minConfidence: 0.7 };

describe("decideAutopilot", () => {
  it("replies when everything is fine", () => {
    expect(decideAutopilot(base)).toEqual({ kind: "reply", text: good.reply });
  });

  it("hands off on a trigger even with a good answer", () => {
    expect(decideAutopilot({ ...base, triggerHit: true })).toEqual({ kind: "handoff", reason: "trigger" });
  });

  it("hands off at the daily turn cap", () => {
    expect(decideAutopilot({ ...base, turnsToday: 6 })).toEqual({ kind: "handoff", reason: "turn_cap" });
  });

  it("hands off when the AI failed", () => {
    expect(decideAutopilot({ ...base, llm: null })).toEqual({ kind: "handoff", reason: "ai_unavailable" });
  });

  it("hands off when the model asks for it", () => {
    expect(decideAutopilot({ ...base, llm: { ...good, handoff: true, handoffReason: "price_quote" } })).toEqual({
      kind: "handoff",
      reason: "model_requested",
    });
  });

  it("hands off on low confidence or an empty reply", () => {
    expect(decideAutopilot({ ...base, llm: { ...good, confidence: 0.4 } })).toEqual({ kind: "handoff", reason: "low_confidence" });
    expect(decideAutopilot({ ...base, llm: { ...good, reply: "   " } })).toEqual({ kind: "handoff", reason: "low_confidence" });
    expect(decideAutopilot({ ...base, llm: { ...good, confidence: Number.NaN } }).kind).toBe("handoff");
  });

  it("caps an overly long reply", () => {
    const decision = decideAutopilot({ ...base, llm: { ...good, reply: "x".repeat(2000) } });

    expect(decision.kind === "reply" && decision.text.length).toBe(1500);
  });
});

describe("pickAiTags", () => {
  const dictionary = [
    { id: "t1", name: "Лендинг" },
    { id: "t2", name: "Горячий" },
    { id: "t3", name: "Telegram-бот" },
    { id: "t4", name: "Тёплый" },
  ];
  const pick = (suggested: Array<{ name: string; confidence: number }>, overrides: Partial<Parameters<typeof pickAiTags>[0]> = {}) =>
    pickAiTags({ suggested, dictionary, dismissedTagIds: new Set(), existingTagIds: new Set(), threshold: 0.6, ...overrides });

  it("drops tags that are not in the dictionary", () => {
    expect(pick([{ name: "Криптовалюта", confidence: 0.99 }])).toEqual({ apply: [], hints: [] });
  });

  it("matches names case- and ё-insensitively", () => {
    expect(pick([{ name: " лендинг ", confidence: 0.9 }, { name: "ТЕПЛЫЙ", confidence: 0.8 }]).apply).toEqual([
      { tagId: "t1", confidence: 0.9 },
      { tagId: "t4", confidence: 0.8 },
    ]);
  });

  it("splits by the confidence threshold into applied tags and hints", () => {
    expect(pick([{ name: "Лендинг", confidence: 0.9 }, { name: "Горячий", confidence: 0.5 }])).toEqual({
      apply: [{ tagId: "t1", confidence: 0.9 }],
      hints: [{ tagId: "t2", confidence: 0.5 }],
    });
  });

  it("never re-adds a tag the manager removed, nor one the lead already has", () => {
    const result = pick([{ name: "Telegram-бот", confidence: 0.95 }, { name: "Лендинг", confidence: 0.9 }], {
      dismissedTagIds: new Set(["t3"]),
      existingTagIds: new Set(["t1"]),
    });

    expect(result).toEqual({ apply: [], hints: [] });
  });

  it("ignores repeated suggestions and clamps confidence", () => {
    expect(pick([{ name: "Лендинг", confidence: 7 }, { name: "лендинг", confidence: 0.1 }]).apply).toEqual([
      { tagId: "t1", confidence: 1 },
    ]);
  });
});
