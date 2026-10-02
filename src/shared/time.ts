// Containers run in UTC unless TZ is set, so date bucketing never relies on the server's local
// zone: every "day" in the product is a day in the agency's time zone.
export const APP_TIMEZONE = "Europe/Moscow";

const DAY_MS = 86_400_000;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset of the app time zone from UTC at the given instant, in minutes (Moscow: +180). */
export function appZoneOffsetMinutes(date: Date): number {
  const p = zonedParts(date);
  const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const instantSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((wallClockAsUtc - instantSeconds) / 60_000);
}

/** "YYYY-MM-DD" of the instant in the app time zone. */
export function toAppDateKey(date: Date): string {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The instant at which the app-zone day containing `date` starts. */
export function startOfAppDay(date: Date): Date {
  const { year, month, day } = zonedParts(date);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  return new Date(midnightAsUtc - appZoneOffsetMinutes(new Date(midnightAsUtc)) * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Date keys of the last `count` app-zone days, oldest first, ending with the day of `now`. */
export function lastAppDateKeys(count: number, now: Date = new Date()): string[] {
  const todayStart = startOfAppDay(now);
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    // Noon of each day: far from any boundary.
    keys.push(toAppDateKey(addDays(todayStart, -offset + 0.5)));
  }
  return keys;
}
