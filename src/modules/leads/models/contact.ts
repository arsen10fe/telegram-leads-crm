export type ContactType = "phone" | "telegram" | "email";
export type ParsedContact = { type: ContactType; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM_USERNAME = /^(?:@|(?:https?:\/\/)?(?:www\.)?t\.me\/)([A-Za-z][A-Za-z0-9_]{4,31})\/?$/i;

/** Normalizes a phone number, @username / t.me link, or e-mail. Returns null for anything else. */
export function parseContact(raw: string): ParsedContact | null {
  const text = raw.trim();
  if (!text) return null;
  if (EMAIL.test(text)) return { type: "email", value: text.toLowerCase() };
  const username = text.match(TELEGRAM_USERNAME);
  if (username) return { type: "telegram", value: `@${username[1]}` };
  return parsePhone(text);
}

/** Russian-friendly phone normalization: 8 (912) 345-67-89, +7 912…, 9123456789 → +79123456789. */
export function parsePhone(raw: string): ParsedContact | null {
  if (!/^[\d\s()+\-.]+$/.test(raw.trim())) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return { type: "phone", value: `+${digits}` };
}

/** Contact derived from the Telegram profile: @username, or a tg:// link when there is none. */
export function telegramContact(from: { id: number | bigint; username?: string | null }): ParsedContact {
  return {
    type: "telegram",
    value: from.username ? `@${from.username}` : `tg://user?id=${from.id}`,
  };
}
