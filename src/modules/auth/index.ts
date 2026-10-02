import {
  createTelegramLinkToken,
  getUser,
  isNotificationChat,
  linkTelegram,
  listTelegramRecipients,
  login,
  unlinkTelegram,
  verifySession,
} from "./auth-service";

/** Public API of the auth module. Framework-free: cookies and redirects live in src/app/_lib. */
export const auth = {
  login,
  verifySession,
  getUser,
  createTelegramLinkToken,
  linkTelegram,
  unlinkTelegram,
  listTelegramRecipients,
  isNotificationChat,
};

export { maskEmail, type SessionUser } from "./auth-service";
export { hashPassword } from "./password";
export { SESSION_TTL_SECONDS } from "./session-token";
