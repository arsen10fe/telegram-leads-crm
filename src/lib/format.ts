import { APP_TIMEZONE } from "@/shared/time";

// Absolute dates always render in the agency's zone, whatever the server or browser zone is.

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const fullDateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** «2 окт., 14:05» */
export function formatDateTime(value: Date | string | number): string {
  return dateTimeFormatter.format(toDate(value));
}

/** «2 октября 2026 г., 14:05» (МСК) */
export function formatFullDateTime(value: Date | string | number): string {
  return `${fullDateTimeFormatter.format(toDate(value))} МСК`;
}

/** «14:05» */
export function formatTime(value: Date | string | number): string {
  return timeFormatter.format(toDate(value));
}

/** pluralRu(5, ["лид", "лида", "лидов"]) → "лидов" */
export function pluralRu(count: number, forms: readonly [one: string, few: string, many: string]): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** «3 лида» */
export function countRu(count: number, forms: readonly [one: string, few: string, many: string]): string {
  return `${count} ${pluralRu(count, forms)}`;
}
