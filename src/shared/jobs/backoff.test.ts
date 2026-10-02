import { describe, expect, it } from "vitest";
import { backoffDelayMs, nextRunAt, shouldGiveUp } from "./backoff";

describe("backoff", () => {
  it.each([
    [1, 5_000],
    [2, 10_000],
    [3, 20_000],
    [4, 40_000],
    [6, 160_000],
    [7, 300_000],
    [20, 300_000],
  ])("attempt %i waits %i ms", (attempt, expected) => {
    expect(backoffDelayMs(attempt)).toBe(expected);
  });

  it("never returns less than the base delay", () => {
    expect(backoffDelayMs(0)).toBe(5_000);
  });

  it("schedules the next run relative to now", () => {
    const now = new Date("2026-10-02T10:00:00.000Z");

    expect(nextRunAt(2, now).toISOString()).toBe("2026-10-02T10:00:10.000Z");
  });

  it("gives up once attempts reach the limit", () => {
    expect(shouldGiveUp(2, 3)).toBe(false);
    expect(shouldGiveUp(3, 3)).toBe(true);
    expect(shouldGiveUp(4, 3)).toBe(true);
  });
});
