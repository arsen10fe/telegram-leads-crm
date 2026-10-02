import { describe, expect, it } from "vitest";
import { AgencySettingsUpdate } from "./agency-settings";

describe("AgencySettingsUpdate", () => {
  it("trims the agency name", () => {
    expect(AgencySettingsUpdate.parse({ agencyName: "  Пиксель и Код  " }).agencyName).toBe("Пиксель и Код");
  });

  it.each([
    [{ agencyName: "А" }],
    [{ agencyName: "А".repeat(81) }],
    [{ knowledgeBase: "x".repeat(20_001) }],
    [{ autopilotMaxTurns: 0 }],
    [{ autopilotMaxTurns: 21 }],
    [{ autopilotMaxTurns: 2.5 }],
    [{ minConfidence: -0.1 }],
    [{ minConfidence: 1.5 }],
    [{ defaultAiModeBot: "always" }],
  ])("rejects out-of-bounds input %j", (input) => {
    expect(AgencySettingsUpdate.safeParse(input).success).toBe(false);
  });

  it("accepts boundary values", () => {
    const parsed = AgencySettingsUpdate.parse({
      knowledgeBase: "x".repeat(20_000),
      autopilotMaxTurns: 20,
      minConfidence: 0,
    });

    expect(parsed.autopilotMaxTurns).toBe(20);
  });

  it("trims trigger words, drops empty ones and dedupes case- and ё-insensitively", () => {
    const parsed = AgencySettingsUpdate.parse({
      triggerWords: ["Договор*", " договор* ", "ДОГОВОР*", "", "   ", "ёлка", "елка", "скидк*"],
    });

    expect(parsed.triggerWords).toEqual(["Договор*", "ёлка", "скидк*"]);
  });

  it("limits the number and length of trigger words", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `слово${i}`);

    expect(AgencySettingsUpdate.safeParse({ triggerWords: tooMany }).success).toBe(false);
    expect(AgencySettingsUpdate.safeParse({ triggerWords: ["я".repeat(41)] }).success).toBe(false);
  });

  it("counts the limit after dedupe", () => {
    const words = [...Array.from({ length: 50 }, (_, i) => `слово${i}`), "слово0"];

    expect(AgencySettingsUpdate.parse({ triggerWords: words }).triggerWords).toHaveLength(50);
  });
});
