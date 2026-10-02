import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiContext } from "@/modules/leads";

vi.mock("@/modules/leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/leads")>()),
  leads: {
    getAiContext: vi.fn(),
    latestInboundMessageId: vi.fn(async () => "in_1"),
    createDraft: vi.fn(async (input: { leadId: string; text: string; noteForManager: string | null }) => ({
      id: "draft_1",
      leadId: input.leadId,
      text: input.text,
      noteForManager: input.noteForManager,
      createdAt: new Date(),
    })),
  },
}));
vi.mock("@/modules/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/settings")>()),
  settings: { get: vi.fn(async () => ({ agencyName: "Пиксель и Код", knowledgeBase: "Лендинг — от 60 000 ₽" })) },
}));

import { leads } from "@/modules/leads";
import { createFakeLlmClient } from "../test/fake-llm-client";
import { suggestReply } from "./copilot-service";

const context: AiContext = {
  lead: { id: "lead_1", source: "telegram_account", name: "Анна", contact: "@anna", request: "SMM", aiMode: "copilot", needsHuman: false, channelKey: "biz:c" },
  messages: [{ author: "client", text: "Сколько стоит SMM?", createdAt: new Date() }],
  tagIds: new Set(),
  dismissedTagIds: new Set(),
  aiTurnsLast24h: 0,
};

describe("suggestReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(leads.getAiContext).mockResolvedValue(context);
  });

  it("creates a pending draft from the model's reply", async () => {
    const llm = createFakeLlmClient({
      reply_draft: { reply: "  SMM — от 45 000 ₽ в месяц. Созвонимся?  ", noteForManager: "Уточнить нишу" },
    });

    const result = await suggestReply("lead_1", llm);

    expect(result).toMatchObject({ ok: true, draft: { id: "draft_1", text: "SMM — от 45 000 ₽ в месяц. Созвонимся?" } });
    expect(leads.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead_1", noteForManager: "Уточнить нишу", meta: expect.objectContaining({ model: "fake-model" }) }),
    );
  });

  it("reports ai_failed for no usable output, an empty reply or a transport error", async () => {
    expect(await suggestReply("lead_1", createFakeLlmClient({ reply_draft: null }))).toEqual({ ok: false, reason: "ai_failed" });
    expect(await suggestReply("lead_1", createFakeLlmClient({ reply_draft: { reply: " ", noteForManager: null } }))).toEqual({
      ok: false,
      reason: "ai_failed",
    });
    expect(await suggestReply("lead_1", createFakeLlmClient({ reply_draft: new Error("429") }))).toEqual({
      ok: false,
      reason: "ai_failed",
    });
    expect(leads.createDraft).not.toHaveBeenCalled();
  });

  it("discards a draft when the client wrote again while the model was thinking", async () => {
    vi.mocked(leads.latestInboundMessageId).mockResolvedValueOnce("in_1").mockResolvedValueOnce("in_2");
    const llm = createFakeLlmClient({ reply_draft: { reply: "SMM — от 45 000 ₽", noteForManager: null } });

    expect(await suggestReply("lead_1", llm)).toEqual({ ok: false, reason: "client_wrote_again" });
    expect(leads.createDraft).not.toHaveBeenCalled();
  });

  it("reports ai_disabled without calling anything when AI is off", async () => {
    expect(await suggestReply("lead_1", null)).toEqual({ ok: false, reason: "ai_disabled" });
    expect(leads.getAiContext).not.toHaveBeenCalled();
  });
});
