import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./session-cookie";

describe("safeNextPath", () => {
  it.each([
    ["/leads/abc?tab=1", "/leads/abc?tab=1"],
    ["/settings", "/settings"],
    [undefined, "/leads"],
    ["", "/leads"],
    ["https://evil.example/", "/leads"],
    ["//evil.example/", "/leads"],
    ["/\\evil.example", "/leads"],
    ["/\t/evil.example", "/leads"],
    ["/\n/evil.example", "/leads"],
    ["/login", "/leads"],
    ["/login?next=/x", "/leads"],
  ])("%s → %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});

describe("isPublicPath", () => {
  it("keeps only login and health check public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/healthz")).toBe(true);
    expect(isPublicPath("/leads")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
