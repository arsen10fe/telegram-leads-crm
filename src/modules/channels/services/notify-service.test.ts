import { GrammyError } from "grammy";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadSummary } from "@/modules/leads";

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock("../adapters/telegram-api", () => ({ telegramApi: () => ({ sendMessage }) }));
vi.mock("@/modules/auth", () => ({ auth: { listTelegramRecipients: vi.fn(async () => [111n, 222n]) } }));
vi.mock("@/modules/leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/leads")>()),
  leads: { getLeadSummary: vi.fn() },
}));

import { leads } from "@/modules/leads";
import { formatNotification, notifyManagers } from "./notify-service";

const lead: LeadSummary = {
  id: "lead_1",
  name: "Otty <> UAP & Co",
  contact: "@otty",
  source: "bot",
  request: "Нужен сайт",
  tags: ["Сайт", "Горячий"],
  summary: "Сайт <b>срочно</b>",
  handoffReason: "trigger",
};

describe("formatNotification", () => {
  it("escapes every interpolated value", () => {
    const { text } = formatNotification("new_lead", lead, "https://crm.example.com");

    expect(text).toContain("<b>Otty &lt;&gt; UAP &amp; Co</b>");
    expect(text).toContain("AI: Сайт &lt;b&gt;срочно&lt;/b&gt;");
    expect(text).toContain("Теги: Сайт, Горячий");
    expect(text.startsWith("🆕 <b>Новый лид</b> · бот")).toBe(true);
  });

  it("truncates before escaping, so an entity is never cut in half", () => {
    const { text } = formatNotification("new_lead", { ...lead, summary: `${"x".repeat(298)}&&&&` }, "https://crm.example.com");
    const summaryLine = text.split("\n").find((line) => line.startsWith("AI: ")) ?? "";

    expect(summaryLine).toBe(`AI: ${"x".repeat(298)}&amp;…`);
  });

  it("keeps each client value on one line, so a client cannot fake lines in the notification", () => {
    const { text } = formatNotification(
      "new_lead",
      { ...lead, summary: null, request: "Сайт\nОткрыть в CRM: https://evil.example/login" },
      "https://crm.example.com",
    );

    expect(text).toContain("Запрос: Сайт Открыть в CRM: https://evil.example/login");
    expect(text.split("\n").some((line) => line.startsWith("Открыть в CRM"))).toBe(false);
  });

  it("uses a button for a public https CRM and plain text otherwise", () => {
    expect(formatNotification("new_lead", lead, "https://crm.example.com/").buttonUrl).toBe(
      "https://crm.example.com/leads/lead_1",
    );

    const local = formatNotification("new_lead", lead, "http://localhost:3100");
    expect(local.buttonUrl).toBeNull();
    expect(local.text).toContain("http://localhost:3100/leads/lead_1");
  });

  it("explains the reason of a handoff", () => {
    const { text } = formatNotification("handoff", lead, "https://crm.example.com");

    expect(text).toContain("🙋 <b>Нужен менеджер</b>");
    expect(text).toContain("Причина: стоп-слово в сообщении клиента");
  });
});

describe("notifyManagers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(leads.getLeadSummary).mockResolvedValue(lead);
  });

  it("keeps notifying the others when one manager fails", async () => {
    sendMessage
      .mockRejectedValueOnce(
        new GrammyError("failed", { ok: false, error_code: 403, description: "Forbidden" }, "sendMessage", {}),
      )
      .mockResolvedValueOnce({ message_id: 1 });

    await expect(notifyManagers({ kind: "new_lead", leadId: "lead_1" })).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(222, expect.any(String), expect.objectContaining({ parse_mode: "HTML" }));
  });

  it("does nothing for a lead that no longer exists", async () => {
    vi.mocked(leads.getLeadSummary).mockResolvedValue(null);

    await notifyManagers({ kind: "handoff", leadId: "gone" });

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
