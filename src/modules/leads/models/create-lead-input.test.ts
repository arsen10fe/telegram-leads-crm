import { describe, expect, it } from "vitest";
import { CreateLeadInput } from "./lead-input";

describe("CreateLeadInput", () => {
  it("trims fields, drops empty optional ones and defaults tags", () => {
    expect(CreateLeadInput.parse({ name: "  Дмитрий  ", contact: "   ", request: "" })).toEqual({
      name: "Дмитрий",
      contact: undefined,
      request: undefined,
      tagIds: [],
    });
  });

  it("requires a name of 2–100 characters", () => {
    expect(CreateLeadInput.safeParse({ name: "Д" }).success).toBe(false);
    expect(CreateLeadInput.safeParse({ name: "  " }).success).toBe(false);
    expect(CreateLeadInput.safeParse({ name: "Д".repeat(101) }).success).toBe(false);
    expect(CreateLeadInput.safeParse({ name: "Ди" }).success).toBe(true);
  });

  it("limits contact and request length", () => {
    expect(CreateLeadInput.safeParse({ name: "Анна", contact: "x".repeat(101) }).success).toBe(false);
    expect(CreateLeadInput.safeParse({ name: "Анна", request: "x".repeat(2001) }).success).toBe(false);
    expect(CreateLeadInput.safeParse({ name: "Анна", request: "x".repeat(2000) }).success).toBe(true);
  });

  it("keeps the selected tags", () => {
    expect(CreateLeadInput.parse({ name: "Анна", tagIds: ["t1", "t2"] }).tagIds).toEqual(["t1", "t2"]);
  });

  it("explains the error in Russian", () => {
    const result = CreateLeadInput.safeParse({ name: "А" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Имя — минимум 2 символа");
  });
});
