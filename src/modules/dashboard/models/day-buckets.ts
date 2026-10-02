import { lastAppDateKeys, toAppDateKey } from "@/shared/time";

export type DayBucket<K extends string> = { date: string; total: number; byKey: Record<K, number> };

/**
 * Counts events per day of the agency's time zone (Europe/Moscow), oldest day first. An event at
 * 23:30 UTC belongs to the next Moscow day — the container's own zone never matters.
 */
export function bucketByAppDay<K extends string>(
  events: Array<{ at: Date; key: K }>,
  keys: readonly K[],
  days: number,
  now: Date,
): DayBucket<K>[] {
  const empty = () => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  const buckets = new Map(lastAppDateKeys(days, now).map((date) => [date, { date, total: 0, byKey: empty() }]));
  for (const event of events) {
    const bucket = buckets.get(toAppDateKey(event.at));
    if (!bucket) continue; // outside the window
    bucket.total += 1;
    bucket.byKey[event.key] += 1;
  }
  return [...buckets.values()];
}
