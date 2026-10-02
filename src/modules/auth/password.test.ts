import { describe, expect, it } from "vitest";
import { hashPassword, TIMING_EQUALIZER_HASH, verifyPassword } from "./password";

describe("password", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("uses a valid hash for timing equalization that matches nothing typed by users", async () => {
    expect(TIMING_EQUALIZER_HASH).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("", TIMING_EQUALIZER_HASH)).toBe(false);
  });
});
