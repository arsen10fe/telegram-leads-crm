import type { Update, UserFromGetMe } from "grammy/types";
import { createBot } from "../create-bot";

const BOT_INFO = {
  id: 42,
  is_bot: true,
  first_name: "Lidogram",
  username: "lidogram_test_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe; // newer Bot API versions add more getMe fields

export type ApiCall = { method: string; payload: Record<string, unknown> };

/**
 * The real bot with a captured transport: no request ever reaches Telegram. `responses` overrides
 * the fake result of specific API methods (e.g. getBusinessConnection).
 */
export function createBotHarness(options: { responses?: Record<string, unknown> } = {}) {
  const calls: ApiCall[] = [];
  const bot = createBot("42:TEST", { botInfo: BOT_INFO }); // botInfo → no getMe, handleUpdate works offline
  let nextMessageId = 10_000;
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (options.responses && method in options.responses) {
      return { ok: true, result: options.responses[method] } as never;
    }
    const result =
      method === "sendMessage"
        ? { message_id: nextMessageId++, date: 0, chat: { id: (payload as { chat_id: number }).chat_id, type: "private" } }
        : true;
    return { ok: true, result } as never;
  });
  return {
    bot,
    calls,
    send: (update: Update) => bot.handleUpdate(update),
    sentTexts: () => calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text)),
  };
}

let nextId = 1;
const user = (id: number, firstName: string, username?: string) => ({ id, is_bot: false, first_name: firstName, username });

function commandEntities(text: string) {
  if (!text.startsWith("/")) return {};
  return { entities: [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0]?.length ?? 0 }] };
}

/** Sample updates. Commands carry a bot_command entity at offset 0, as Telegram sends them. */
export const updates = {
  text: (chatId: number, text: string, from = user(chatId, "Пётр", "petr_test")): Update =>
    ({
      update_id: nextId++,
      message: {
        message_id: nextId++,
        date: 0,
        text,
        chat: { id: chatId, type: "private", first_name: from.first_name },
        from,
        ...commandEntities(text),
      },
    }) as Update,

  contact: (chatId: number, phone: string): Update =>
    ({
      update_id: nextId++,
      message: {
        message_id: nextId++,
        date: 0,
        contact: { phone_number: phone, first_name: "Пётр", user_id: chatId },
        chat: { id: chatId, type: "private", first_name: "Пётр" },
        from: user(chatId, "Пётр", "petr_test"),
      },
    }) as Update,

  photo: (chatId: number): Update =>
    ({
      update_id: nextId++,
      message: {
        message_id: nextId++,
        date: 0,
        photo: [{ file_id: "f", file_unique_id: "u", width: 1, height: 1 }],
        chat: { id: chatId, type: "private", first_name: "Пётр" },
        from: user(chatId, "Пётр", "petr_test"),
      },
    }) as Update,

  groupText: (chatId: number, text: string): Update =>
    ({
      update_id: nextId++,
      message: {
        message_id: nextId++,
        date: 0,
        text,
        chat: { id: chatId, type: "group", title: "Группа" },
        from: user(1, "Пётр"),
      },
    }) as Update,

  businessConnection: (connectionId: string, ownerId: number, enabled = true, canReply = true): Update =>
    ({
      update_id: nextId++,
      business_connection: {
        id: connectionId,
        user: user(ownerId, "Менеджер", "manager_acc"),
        user_chat_id: ownerId,
        date: 0,
        rights: canReply ? { can_reply: true } : {},
        is_enabled: enabled,
      },
    }) as Update,

  businessMessage: (
    connectionId: string,
    chatId: number,
    fromId: number,
    text: string,
    extra: Record<string, unknown> = {},
  ): Update =>
    ({
      update_id: nextId++,
      business_message: {
        message_id: nextId++,
        date: 0,
        text,
        business_connection_id: connectionId,
        chat: { id: chatId, type: "private", first_name: "Анна" },
        from: user(fromId, fromId === chatId ? "Анна" : "Менеджер", fromId === chatId ? "anna_client" : "manager_acc"),
        ...extra,
      },
    }) as Update,

  /** An update type the bot does not handle at all. */
  unknown: (): Update => ({ update_id: nextId++, poll: { id: "p", question: "?", options: [] } }) as unknown as Update,
};
