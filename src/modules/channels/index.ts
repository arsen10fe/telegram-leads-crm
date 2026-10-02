import { listConnections } from "./services/business-connection-service";
import { notifyManagers } from "./services/notify-service";
import { getReplyAvailability } from "./services/reply-availability-service";
import { sendToLead } from "./services/send-to-lead-service";

/** Public API of the channels module (Telegram). */
export const channels = {
  sendToLead,
  getReplyAvailability,
  notifyManagers,
  listBusinessConnections: listConnections,
};

export { formatNotification, type NotificationKind } from "./services/notify-service";

export type { ReplyAvailability } from "./services/reply-availability-service";

export {
  MAX_OUTBOUND_LENGTH,
  type SendFailure,
  type SendInput,
  type SendResult,
} from "./services/send-to-lead-service";

export { requireBotToken, telegramApi } from "./adapters/telegram-api";
export { escapeHtml, safe, truncate } from "./adapters/telegram-html";
export { ALLOWED_UPDATES, createBot } from "./create-bot";
export {
  BUSINESS_REPLY_WINDOW_MS,
  businessWindowClosesAt,
  canReplyInBusinessChat,
  type BusinessConnectionRecord,
} from "./models/business-connection";
export { texts } from "./models/bot-texts";
