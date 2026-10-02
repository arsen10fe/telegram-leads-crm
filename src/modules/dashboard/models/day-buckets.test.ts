import { describe, expect, it } from "vitest";
import { startOfAppDay } from "@/shared/time";
import { bucketByAppDay } from "./day-buckets";

const SOURCES = ["bot", "manual"] as const;

describe("bucketByAppDay", () => {
  const now = new Date("2026-10-02T09:00:00Z"); // 12:00 in Moscow

  it("puts an event at 23:30 UTC into the next Moscow day", () => {
    const buckets = bucketByAppDay([{ at: new Date("2026-10-01T23:30:00Z"), key: "bot" }], SOURCES, 3, now);

    expect(buckets.map((bucket) => [bucket.date, bucket.total])).toEqual([
      ["2026-09-30", 0],
      ["2026-10-01", 0],
      ["2026-10-02", 1],
    ]);
  });

  it("keeps an event at 20:59 UTC on the same Moscow day", () => {
    const buckets = bucketByAppDay([{ at: new Date("2026-10-01T20:59:00Z"), key: "manual" }], SOURCES, 2, now);

    expect(buckets).toEqual([
      { date: "2026-10-01", total: 1, byKey: { bot: 0, manual: 1 } },
      { date: "2026-10-02", total: 0, byKey: { bot: 0, manual: 0 } },
    ]);
  });

  it("ignores events outside the window", () => {
    const buckets = bucketByAppDay([{ at: new Date("2026-09-01T10:00:00Z"), key: "bot" }], SOURCES, 14, now);

    expect(buckets).toHaveLength(14);
    expect(buckets.every((bucket) => bucket.total === 0)).toBe(true);
  });

  it("starts the Moscow day at 21:00 UTC of the previous calendar day", () => {
    expect(startOfAppDay(now).toISOString()).toBe("2026-10-01T21:00:00.000Z");
  });
});
