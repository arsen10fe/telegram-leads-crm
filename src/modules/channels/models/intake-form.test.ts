import { describe, expect, it } from "vitest";
import type { ParsedContact } from "@/modules/leads";
import { advanceIntake, parseIntakeData, type IntakeInput } from "./intake-form";

const text = (value: string, contact: ParsedContact | null = null): IntakeInput => ({ kind: "text", text: value, contact });
const phone = { type: "phone" as const, value: "+79123456789" };

describe("advanceIntake", () => {
  describe("name step", () => {
    it("moves to the contact step with a trimmed name", () => {
      expect(advanceIntake("name", {}, text("  Пётр  "))).toEqual({ kind: "ask", step: "contact", data: { name: "Пётр" } });
    });

    it.each([["П"], ["П".repeat(101)], ["/help"], ["   "]])("re-asks for %j", (value) => {
      expect(advanceIntake("name", {}, text(value))).toEqual({ kind: "ask", step: "name", data: {}, retry: "invalid" });
    });

    it("re-asks for text when a photo arrives", () => {
      expect(advanceIntake("name", {}, { kind: "unsupported" })).toMatchObject({ step: "name", retry: "unsupported" });
    });

    it("rejects a shared phone instead of a name", () => {
      expect(advanceIntake("name", {}, { kind: "shared_phone", contact: phone })).toMatchObject({ step: "name", retry: "invalid" });
    });
  });

  describe("contact step", () => {
    const data = { name: "Пётр" };

    it("accepts a typed contact the controller recognized", () => {
      expect(advanceIntake("contact", data, text("8 912 345 67 89", phone))).toEqual({
        kind: "ask",
        step: "request",
        data: { name: "Пётр", contact: "+79123456789", contactType: "phone" },
      });
    });

    it("accepts a shared phone and the «write in Telegram» button", () => {
      expect(advanceIntake("contact", data, { kind: "shared_phone", contact: phone })).toMatchObject({ step: "request" });
      expect(
        advanceIntake("contact", data, { kind: "use_telegram", contact: { type: "telegram", value: "@petr" } }),
      ).toMatchObject({ step: "request", data: { contact: "@petr", contactType: "telegram" } });
    });

    it("re-asks when the contact is not recognized", () => {
      expect(advanceIntake("contact", data, text("завтра позвоню"))).toEqual({ kind: "ask", step: "contact", data, retry: "invalid" });
      expect(advanceIntake("contact", data, { kind: "shared_phone", contact: null })).toMatchObject({ retry: "invalid" });
      expect(advanceIntake("contact", data, { kind: "unsupported" })).toMatchObject({ retry: "unsupported" });
    });
  });

  describe("request step", () => {
    const data = { name: "Пётр", contact: "+79123456789", contactType: "phone" as const };

    it("completes the form", () => {
      expect(advanceIntake("request", data, text("  Нужен лендинг  "))).toEqual({
        kind: "complete",
        lead: { name: "Пётр", contact: "+79123456789", contactType: "phone", request: "Нужен лендинг" },
      });
    });

    it("caps the request at 2000 characters", () => {
      const result = advanceIntake("request", data, text("x".repeat(3000)));

      expect(result.kind === "complete" && result.lead.request.length).toBe(2000);
    });

    it("re-asks for a too short request or a photo", () => {
      expect(advanceIntake("request", data, text("ok"))).toMatchObject({ step: "request", retry: "invalid" });
      expect(advanceIntake("request", data, { kind: "unsupported" })).toMatchObject({ step: "request", retry: "unsupported" });
    });

    it("restarts a corrupted session instead of creating a broken lead", () => {
      expect(advanceIntake("request", { name: "Пётр" }, text("Нужен сайт"))).toEqual({ kind: "ask", step: "name", data: {} });
    });
  });
});

describe("parseIntakeData", () => {
  it("accepts stored data and rejects garbage", () => {
    expect(parseIntakeData({ name: "Пётр", contactType: "phone" })).toEqual({ name: "Пётр", contactType: "phone" });
    expect(parseIntakeData({ contactType: "fax" })).toBeNull();
    expect(parseIntakeData("oops")).toBeNull();
  });
});
