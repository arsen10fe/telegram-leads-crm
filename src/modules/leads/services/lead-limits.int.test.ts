// Regression tests for DEF-11 and DEF-15 (QA 2026-10-02): the list and the lead card stay bounded,
// and the UI can tell the manager that something was left out.
import { describe, expect, it } from "vitest";
import { db } from "@/shared/db";
import { countLeads, createManualLead, getLeadDetails, listLeads } from "./lead-service";

describe("bounded reads (integration)", () => {
  it("counts every matching lead even when the list stops at 100 (DEF-11)", async () => {
    const now = Date.now();
    await db.lead.createMany({
      data: Array.from({ length: 103 }, (_, index) => ({
        name: `Лид ${index}`,
        source: "manual" as const,
        aiMode: "off" as const,
        lastActivityAt: new Date(now - index * 1000),
      })),
    });

    expect(await listLeads({})).toHaveLength(100);
    expect(await countLeads({})).toBe(103);
    expect(await countLeads({ q: "Лид 10" })).toBe(4); // «Лид 10», «Лид 100», «Лид 101», «Лид 102»
  });

  it("loads only the latest 200 messages of a long conversation, oldest first (DEF-15)", async () => {
    const { leadId } = await createManualLead({ name: "Болтливый клиент" }, null);
    const start = Date.now() - 1_000_000;
    await db.message.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({
        leadId,
        direction: "inbound" as const,
        author: "client" as const,
        text: `Сообщение ${index}`,
        createdAt: new Date(start + index * 1000),
      })),
    });

    const lead = await getLeadDetails(leadId);

    expect(lead?.messages).toHaveLength(200);
    expect(lead?.messages[0]?.text).toBe("Сообщение 5");
    expect(lead?.messages.at(-1)?.text).toBe("Сообщение 204");
    expect(lead?.hiddenMessageCount).toBe(5);
  });
});
