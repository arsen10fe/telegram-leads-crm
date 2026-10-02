import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit within the window, then refuses", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect([1, 2, 3, 4].map(() => limiter.take("ip", 1_000))).toEqual([true, true, true, false]);
  });

  it("allows again once the window has passed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.take("ip", 0);

    expect(limiter.take("ip", 30_000)).toBe(false);
    expect(limiter.take("ip", 60_001)).toBe(true);
  });

  it("keeps memory bounded under a flood of distinct keys", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 100 });

    for (let index = 0; index < 1_000; index += 1) limiter.take(`spoofed-${index}`, 1_000);

    expect(limiter.size()).toBeLessThanOrEqual(100);
  });
});
