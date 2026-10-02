import { randomBytes } from "node:crypto";
import { db } from "@/shared/db";
import { getEnv } from "@/shared/env";
import { createLogger } from "@/shared/logger";
import { TIMING_EQUALIZER_HASH, verifyPassword } from "./password";
import { signSession, verifySessionToken } from "./session-token";
import { userRepository } from "./user-repository";

const log = createLogger("auth");

const LINK_TOKEN_TTL_MS = 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  telegramLinked: boolean;
  telegramLinkedAt: Date | null;
};

/** "manager@demo.local" → "ma***@demo.local": enough to debug, not enough to leak. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

/** Returns a signed session token, or null. Always runs a bcrypt compare (no timing oracle). */
export async function login(emailInput: string, password: string): Promise<{ userId: string; token: string } | null> {
  const email = emailInput.trim().toLowerCase();
  const user = await userRepository.findByEmail(db, email);
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? TIMING_EQUALIZER_HASH);
  if (!user || !passwordMatches) {
    log.warn({ reason: "bad_credentials", emailMasked: maskEmail(email) }, "login failed");
    return null;
  }
  const token = await signSession(user.id, getEnv().AUTH_SECRET);
  log.info({ userId: user.id }, "login success");
  return { userId: user.id, token };
}

export async function verifySession(token: string): Promise<{ userId: string } | null> {
  const result = await verifySessionToken(token, getEnv().AUTH_SECRET);
  if (result.ok) return { userId: result.userId };
  log.debug({ reason: result.reason }, "invalid session");
  return null;
}

export async function getUser(userId: string): Promise<SessionUser | null> {
  const user = await userRepository.findById(db, userId);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    telegramLinked: user.telegramChatId !== null,
    telegramLinkedAt: user.telegramLinkedAt,
  };
}

/** One-time token for the deep link https://t.me/<bot>?start=link_<token> (≤ 64 chars, base64url). */
export async function createTelegramLinkToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await userRepository.update(db, userId, {
    linkToken: token,
    linkTokenExpiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
  });
  log.info({ userId }, "telegram link token created");
  return token;
}

/** Called by the bot on /start link_<token>. False for unknown or expired tokens. */
export async function linkTelegram(input: { token: string; chatId: bigint }): Promise<boolean> {
  const now = new Date();
  const userId = await db.$transaction(async (tx) => {
    const user = await userRepository.findByLinkToken(tx, input.token);
    if (!user || !user.linkTokenExpiresAt || user.linkTokenExpiresAt.getTime() < now.getTime()) return null;
    await userRepository.unlinkChatFromOthers(tx, input.chatId, user.id);
    await userRepository.update(tx, user.id, {
      telegramChatId: input.chatId,
      telegramLinkedAt: now,
      linkToken: null,
      linkTokenExpiresAt: null,
    });
    return user.id;
  });
  if (!userId) {
    log.warn("telegram link token unknown or expired");
    return false;
  }
  log.info({ userId }, "manager linked telegram");
  return true;
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await userRepository.update(db, userId, { telegramChatId: null, telegramLinkedAt: null });
  log.info({ userId }, "manager unlinked telegram");
}

/** Chats of managers who linked Telegram for notifications. */
export async function listTelegramRecipients(): Promise<bigint[]> {
  const rows = await userRepository.listTelegramChatIds(db);
  return rows.flatMap((row) => (row.telegramChatId === null ? [] : [row.telegramChatId]));
}

/** The chat is a manager's notification chat with the bot (not a client). */
export async function isNotificationChat(chatId: bigint): Promise<boolean> {
  return (await listTelegramRecipients()).includes(chatId);
}
