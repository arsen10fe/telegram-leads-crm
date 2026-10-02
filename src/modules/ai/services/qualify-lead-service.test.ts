import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiContext } from "@/modules/leads";

vi.mock("@/modules/leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/leads")>()),
  leads: {
    getAiContext: vi.fn(),
    listTags: vi.fn(),
    setAiStatus: vi.fn(),
    saveQualification: vi.fn(),
  },
}));
vi.mock("@/modules/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/settings")>()),
  settings: {
    get: vi.fn(async () => ({ agencyName: "Пиксель и Код", knowledgeBase: "Лендинг — от 60 000 ₽" })),
  },
}));

import { leads } from "@/modules/leads";
import { createFakeLlmClient } from "../test/fake-llm-client";
import { qualifyLead } from "./qualify-lead-service";

const context: AiContext = {
  lead: {
    id: "lead_1",
    source: "bot",
    name: "Пётр",
    contact: "+79123456789",
    request: "Нужен лендинг для кофейни",
    aiMode: "autopilot",
    needsHuman: false,
    channelKey: "bot",
  },
  messages: [{ author: "client", text: "Нужен лендинг для кофейни, бюджет 80к", createdAt: new Date() }],
  tagIds: new Set(),
  dismissedTagIds: new Set(["t_hot"]),
  aiTurnsLast24h: 0,
};

const dictionary = [
  { id: "t_landing", name: "Лендинг", color: "sky" },
  { id: "t_hot", name: "Горячий", color: "red" },
  { id: "t_smm", name: "SMM", color: "pink" },
];

const output = {
  service: "landing",
  budget: "80к",
  urgency: "normal",
  temperature: "hot",
  summary: "Лендинг для кофейни, бюджет 80к",
  suggestedTags: [
    { name: "Лендинг", confidence: 0.93 },
    { name: "Горячий", confidence: 0.9 }, // dismissed by the manager
    { name: "SMM", confidence: 0.4 }, // below the threshold → hint
    { name: "Кофейни", confidence: 0.99 }, // invented → dropped
  ],
  confidence: 0.86,
};

describe("qualifyLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(leads.getAiContext).mockResolvedValue(context);
    vi.mocked(leads.listTags).mockResolvedValue(dictionary);
  });

  it("applies only dictionary tags, skips dismissed ones and keeps weak ones as hints", async () => {
    const llm = createFakeLlmClient({ lead_qualification: output });

    expect(await qualifyLead("lead_1", llm)).toBe("qualified");

    expect(leads.saveQualification).toHaveBeenCalledWith({
      leadId: "lead_1",
      qualification: expect.objectContaining({ temperature: "hot", budget: "80к", hints: ["t_smm"], model: "fake-model" }),
      aiTags: [{ tagId: "t_landing", confidence: 0.93 }],
    });
  });

  it("sends the tag dictionary and the knowledge base in the static prompt, client text in the data block", async () => {
    const llm = createFakeLlmClient({ lead_qualification: output });

    await qualifyLead("lead_1", llm);

    const request = llm.calls[0];
    expect(request?.system).toContain("Лендинг, Горячий, SMM");
    expect(request?.system).toContain("Лендинг — от 60 000 ₽");
    expect(request?.system).not.toContain("кофейни");
    expect(request?.user).toContain('<client_messages>\n[клиент] "Нужен лендинг для кофейни, бюджет 80к"');
  });

  it("marks AI as failed when the model gives no usable output", async () => {
    const llm = createFakeLlmClient({ lead_qualification: null });

    expect(await qualifyLead("lead_1", llm)).toBe("failed");

    expect(leads.setAiStatus).toHaveBeenCalledWith("lead_1", "failed");
    expect(leads.saveQualification).not.toHaveBeenCalled();
  });

  it("marks AI as disabled without any call when the kill switch is off", async () => {
    expect(await qualifyLead("lead_1", null)).toBe("disabled");

    expect(leads.setAiStatus).toHaveBeenCalledWith("lead_1", "disabled");
    expect(leads.getAiContext).not.toHaveBeenCalled();
  });

  it("lets transport errors through so the job is retried", async () => {
    const llm = createFakeLlmClient({ lead_qualification: new Error("timeout") });

    await expect(qualifyLead("lead_1", llm)).rejects.toThrow("timeout");
    expect(leads.setAiStatus).not.toHaveBeenCalled();
  });
});
