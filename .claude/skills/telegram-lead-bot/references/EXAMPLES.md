# Telegram Lead Bot — Code Examples

Copy-ready sketches for `src/modules/channels`. They follow `.ai-factory/ARCHITECTURE.md`.
Adjust names to the real `leads`/`auth` public APIs when they exist.

## 1. Shared API client and HTML helpers

```ts
// src/modules/channels/adapters/telegram-api.ts
import { Api } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { env } from "@/shared/env";

let api: Api | undefined;

/** One sending client for both processes. Only the worker owns a Bot (getUpdates). */
export function telegramApi(): Api {
  if (!api) {
    api = new Api(env.TELEGRAM_BOT_TOKEN);
    api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));
  }
  return api;
}
```

```ts
// src/modules/channels/adapters/telegram-html.ts
/** Escape for parse_mode HTML. Truncate BEFORE escaping so entities are never cut in half. */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export const safe = (value: string | null | undefined, max = 300) => escapeHtml(truncate(value ?? "—", max));
```

## 2. Bot composition and the worker entry point

```ts
// src/modules/channels/create-bot.ts
import { Bot, GrammyError, HttpError } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { logger } from "@/shared/logger";
import { startController } from "./controllers/start";
import { intakeController } from "./controllers/intake";
import { businessController } from "./controllers/business";

export const ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
] as const;

const log = logger.child({ module: "bot" });

export function createBot(token: string, options?: ConstructorParameters<typeof Bot>[1]) {
  const bot = new Bot(token, options);
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));

  bot.use(startController);    // /start, /start link_<token>, /cancel — before the form
  bot.use(businessController); // business_* updates
  bot.use(intakeController);   // form steps + free messages — keep last

  bot.catch((err) => {
    const e = err.error;
    const updateId = err.ctx.update.update_id;
    if (e instanceof GrammyError) log.error({ updateId, code: e.error_code, description: e.description }, "bot api error");
    else if (e instanceof HttpError) log.error({ updateId, err: e.error }, "telegram unreachable");
    else log.error({ updateId, err: e }, "bot handler failed");
  });
  return bot;
}
```

```ts
// src/worker/main.ts (bot part; the job runner starts next to it)
import { createBot, ALLOWED_UPDATES } from "@/modules/channels";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";

const bot = createBot(env.TELEGRAM_BOT_TOKEN);
const shutdown = () => bot.stop();
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

if (env.TELEGRAM_MODE === "polling") {
  await bot.start({
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: false, // pending updates are leads
    onStart: (me) => logger.info({ bot: me.username }, "bot polling started"),
  });
}
```

## 3. Intake form: pure step machine

```ts
// src/modules/channels/models/contact.ts
export type ContactType = "phone" | "telegram" | "email";
export type ParsedContact = { type: ContactType; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME = /^(?:@|(?:https?:\/\/)?t\.me\/)([A-Za-z0-9_]{5,32})$/i;

export function parseContact(raw: string): ParsedContact | null {
  const text = raw.trim();
  if (EMAIL.test(text)) return { type: "email", value: text.toLowerCase() };
  const username = text.match(USERNAME);
  if (username) return { type: "telegram", value: `@${username[1]}` };
  return parsePhone(text);
}

export function parsePhone(raw: string): ParsedContact | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return { type: "phone", value: `+${digits}` };
}

export function telegramContact(from: { id: number; username?: string }): ParsedContact {
  return { type: "telegram", value: from.username ? `@${from.username}` : `tg://user?id=${from.id}` };
}
```

```ts
// src/modules/channels/models/intake-form.ts
import { parseContact, parsePhone, type ContactType } from "./contact";

export type IntakeStep = "name" | "contact" | "request";
export type IntakeData = { name?: string; contact?: string; contactType?: ContactType };
export type IntakeInput =
  | { kind: "text"; text: string }
  | { kind: "shared_phone"; phone: string }
  | { kind: "use_telegram"; value: string } // pre-built by the controller from ctx.from
  | { kind: "unsupported" };

export type IntakeTransition =
  | { kind: "ask"; step: IntakeStep; data: IntakeData; retry?: "invalid" | "unsupported" }
  | { kind: "complete"; lead: { name: string; contact: string; contactType: ContactType; request: string } };

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function advanceIntake(step: IntakeStep, data: IntakeData, input: IntakeInput): IntakeTransition {
  if (input.kind === "unsupported") return { kind: "ask", step, data, retry: "unsupported" };

  if (step === "name") {
    if (input.kind !== "text") return { kind: "ask", step, data, retry: "invalid" };
    const name = input.text.trim();
    if (name.length < 2 || name.length > 100) return { kind: "ask", step, data, retry: "invalid" };
    return { kind: "ask", step: "contact", data: { ...data, name } };
  }

  if (step === "contact") {
    const contact =
      input.kind === "shared_phone" ? parsePhone(input.phone)
      : input.kind === "use_telegram" ? { type: "telegram" as const, value: input.value }
      : parseContact(input.text);
    if (!contact) return { kind: "ask", step, data, retry: "invalid" };
    return { kind: "ask", step: "request", data: { ...data, contact: contact.value, contactType: contact.type } };
  }

  if (input.kind !== "text" || input.text.trim().length < 3) return { kind: "ask", step, data, retry: "invalid" };
  if (!data.name || !data.contact || !data.contactType) return { kind: "ask", step: "name", data: {} }; // corrupted session
  return {
    kind: "complete",
    lead: { name: data.name, contact: data.contact, contactType: data.contactType, request: input.text.trim().slice(0, 2000) },
  };
}
```

## 4. Intake controller (thin)

```ts
// src/modules/channels/controllers/intake.ts
import { Composer, Keyboard, type Context } from "grammy";
import { leads } from "@/modules/leads";
import { advanceIntake, type IntakeInput } from "../models/intake-form";
import { telegramContact } from "../models/contact";
import { texts } from "../models/bot-texts";
import { intakeSessionRepository as sessions } from "../repositories/intake-session-repository";

export const intakeController = new Composer().chatType("private");

const contactKeyboard = new Keyboard()
  .requestContact(texts.sharePhoneButton)
  .row()
  .text(texts.useTelegramButton)
  .resized()
  .oneTime();

intakeController.on("message", async (ctx) => {
  const chatId = BigInt(ctx.chat.id);
  const session = await sessions.findActive(chatId); // null if missing or older than SESSION_TTL_MS

  if (!session) {
    // No form in progress: append to the chat's latest lead, or start the form if there is none.
    const result = await leads.ingestInbound({
      channelKey: "bot",
      chatId,
      telegramMessageId: ctx.msg.message_id,
      text: ctx.msg.text ?? texts.placeholderFor(ctx.msg),
      source: "bot",
      from: ctx.from,
      createLeadIfMissing: false,
    });
    if (result.status === "no_lead") await startForm(ctx, chatId);
    return;
  }

  const transition = advanceIntake(session.step, session.data, toIntakeInput(ctx));
  if (transition.kind === "ask") {
    await sessions.save(chatId, transition.step, transition.data);
    const prompt = transition.retry ? texts.retry(transition.step, transition.retry) : texts.ask(transition.step);
    await ctx.reply(prompt, transition.step === "contact" ? { reply_markup: contactKeyboard } : {});
    return;
  }

  // Lead + inbound message + jobs in ONE transaction; session deleted inside it.
  await leads.submitIntake({ chatId, telegramMessageId: ctx.msg.message_id, from: ctx.from, ...transition.lead });
  await ctx.reply(texts.submitted(transition.lead.name), { reply_markup: { remove_keyboard: true } });
});

function toIntakeInput(ctx: Context): IntakeInput {
  const msg = ctx.message;
  if (msg?.contact) return { kind: "shared_phone", phone: msg.contact.phone_number };
  if (msg?.text === texts.useTelegramButton && ctx.from) return { kind: "use_telegram", value: telegramContact(ctx.from).value };
  if (msg?.text) return { kind: "text", text: msg.text };
  return { kind: "unsupported" };
}

export async function startForm(ctx: Context, chatId: bigint) {
  await sessions.save(chatId, "name", {});
  await ctx.reply(texts.greeting, { reply_markup: { remove_keyboard: true } });
}
```

```ts
// src/modules/channels/controllers/start.ts
import { Composer } from "grammy";
import { auth } from "@/modules/auth";
import { texts } from "../models/bot-texts";
import { intakeSessionRepository as sessions } from "../repositories/intake-session-repository";
import { startForm } from "./intake";

export const startController = new Composer().chatType("private");

startController.command("start", async (ctx) => {
  const payload = ctx.match.trim();
  if (payload.startsWith("link_")) {
    const linked = await auth.linkTelegram({ token: payload.slice(5), chatId: BigInt(ctx.chat.id) });
    await ctx.reply(linked ? texts.notificationsLinked : texts.linkExpired);
    return;
  }
  await startForm(ctx, BigInt(ctx.chat.id)); // /start always restarts the form
});

startController.command("cancel", async (ctx) => {
  await sessions.delete(BigInt(ctx.chat.id));
  await ctx.reply(texts.cancelled, { reply_markup: { remove_keyboard: true } });
});
```

## 5. Business controller

```ts
// src/modules/channels/controllers/business.ts
import { Composer } from "grammy";
import { leads } from "@/modules/leads";
import { logger } from "@/shared/logger";
import { texts } from "../models/bot-texts";
import { businessConnectionService } from "../services/business-connection-service";

export const businessController = new Composer();
const log = logger.child({ module: "bot.business" });

businessController.on("business_connection", async (ctx) => {
  const conn = ctx.businessConnection;
  const { isNewlyEnabled } = await businessConnectionService.upsert({
    id: conn.id,
    ownerUserId: BigInt(conn.user.id),
    ownerChatId: BigInt(conn.user_chat_id),
    ownerName: [conn.user.first_name, conn.user.last_name].filter(Boolean).join(" "),
    canReply: conn.rights?.can_reply ?? false,
    isEnabled: conn.is_enabled,
  });
  if (isNewlyEnabled) await ctx.api.sendMessage(conn.user_chat_id, texts.businessConnected);
});

businessController.on("business_message", async (ctx) => {
  const msg = ctx.businessMessage;
  const conn = await businessConnectionService.getOrFetch(ctx.businessConnectionId!, () => ctx.getBusinessConnection());
  if (!conn?.isEnabled) return;
  if (msg.sender_business_bot) return; // echo of a message we sent on the owner's behalf

  const base = {
    channelKey: `biz:${conn.id}`,
    chatId: BigInt(msg.chat.id),
    telegramMessageId: msg.message_id,
    text: msg.text ?? texts.placeholderFor(msg),
  };

  if (BigInt(ctx.from.id) === conn.ownerUserId) {
    await leads.recordManagerMessage({ ...base, via: "telegram_app" }); // no-op if the chat has no lead
    return;
  }
  await leads.ingestInbound({ ...base, source: "telegram_account", from: ctx.from, createLeadIfMissing: true });
});

businessController.on(["edited_business_message", "deleted_business_messages"], (ctx) => {
  log.debug({ updateId: ctx.update.update_id }, "business edit/delete ignored in MVP");
});
```

## 6. `sendToLead` — the only outbound path

```ts
// src/modules/channels/models/business-connection.ts
export const BUSINESS_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canReplyInBusinessChat(
  conn: { isEnabled: boolean; canReply: boolean } | null,
  lastInboundAt: Date | null,
  now: Date,
): boolean {
  if (!conn?.isEnabled || !conn.canReply || !lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < BUSINESS_REPLY_WINDOW_MS;
}
```

```ts
// src/modules/channels/services/send-to-lead-service.ts
import { GrammyError, HttpError } from "grammy";
import { leads } from "@/modules/leads";
import { logger } from "@/shared/logger";
import { telegramApi } from "../adapters/telegram-api";
import { canReplyInBusinessChat } from "../models/business-connection";
import { businessConnectionRepository } from "../repositories/business-connection-repository";

export type SendFailure = "empty" | "too_long" | "no_channel" | "business_window_closed" | "blocked" | "rejected" | "network";
export type SendResult = { ok: true; messageId: string } | { ok: false; reason: SendFailure };

const log = logger.child({ module: "channels.send" });

export async function sendToLead(input: {
  leadId: string;
  text: string;
  author: "manager" | "ai";
  actorId?: string;
  meta?: Record<string, unknown>;
}): Promise<SendResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > 4000) return { ok: false, reason: "too_long" };

  const target = await leads.getChannelTarget(input.leadId); // { channelKey, chatId, lastInboundAt } | null
  if (!target) return { ok: false, reason: "no_channel" };

  const businessConnectionId = target.channelKey.startsWith("biz:") ? target.channelKey.slice(4) : undefined;
  if (businessConnectionId) {
    const conn = await businessConnectionRepository.find(businessConnectionId);
    if (!canReplyInBusinessChat(conn, target.lastInboundAt, new Date())) return { ok: false, reason: "business_window_closed" };
  }

  const record = { leadId: input.leadId, author: input.author, text, actorId: input.actorId, meta: input.meta, ...target };
  try {
    // Plain text on purpose: no parse_mode → client/AI text can't break markup.
    const sent = await telegramApi().sendMessage(
      Number(target.chatId),
      text,
      businessConnectionId ? { business_connection_id: businessConnectionId } : {},
    );
    const message = await leads.recordOutbound({ ...record, telegramMessageId: sent.message_id });
    return { ok: true, messageId: message.id };
  } catch (err) {
    const reason = classifySendError(err);
    log.warn({ leadId: input.leadId, reason }, "send to lead failed");
    await leads.recordOutbound({ ...record, deliveryError: reason });
    return { ok: false, reason };
  }
}

function classifySendError(err: unknown): SendFailure {
  if (err instanceof GrammyError) return err.error_code === 403 ? "blocked" : "rejected";
  if (err instanceof HttpError) return "network";
  throw err; // programming error — let it surface
}
```

## 7. Manager notifications (job handler target)

```ts
// src/modules/channels/services/notify-service.ts
import { InlineKeyboard } from "grammy";
import { auth } from "@/modules/auth";
import { leads } from "@/modules/leads";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { telegramApi } from "../adapters/telegram-api";
import { safe } from "../adapters/telegram-html";

export async function notifyManagers(input: { kind: "new_lead" | "handoff"; leadId: string }) {
  const lead = await leads.getLeadSummary(input.leadId); // name, contact, source, tags, summary, handoffReason
  if (!lead) return;
  const url = `${env.APP_URL}/leads/${lead.id}`;
  const isPublicUrl = url.startsWith("https://");

  const lines = [
    input.kind === "new_lead" ? "🆕 <b>Новый лид</b>" : "🙋 <b>Нужен менеджер</b>",
    `${safe(lead.name, 100)} · ${safe(lead.contact, 100)}`,
    lead.tags.length ? `Теги: ${safe(lead.tags.join(", "), 200)}` : null,
    lead.summary ? `AI: ${safe(lead.summary, 300)}` : null,
    input.kind === "handoff" ? `Причина: ${safe(lead.handoffReason, 100)}` : null,
    isPublicUrl ? null : safe(url, 200), // dev: link as text, buttons need a public https URL
  ].filter(Boolean);

  for (const chatId of await auth.listTelegramRecipients()) {
    try {
      await telegramApi().sendMessage(Number(chatId), lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: isPublicUrl ? new InlineKeyboard().url("Открыть в CRM", url) : undefined,
      });
    } catch (err) {
      logger.warn({ err, leadId: lead.id }, "manager notification failed"); // one manager never blocks others
    }
  }
}
```

## 8. Test harness and sample updates

```ts
// src/modules/channels/test/bot-harness.ts
import type { Update, UserFromGetMe } from "grammy/types";
import { createBot } from "../create-bot";

const BOT_INFO = {
  id: 42, is_bot: true, first_name: "Lidogram", username: "lidogram_test_bot",
  can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false,
} as UserFromGetMe; // cast: newer Bot API versions add more getMe fields

export function createBotHarness() {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const bot = createBot("42:TEST", { botInfo: BOT_INFO }); // botInfo → no getMe, handleUpdate works offline
  let nextMessageId = 1000;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    const result = method === "sendMessage"
      ? { message_id: nextMessageId++, date: 0, chat: { id: (payload as { chat_id: number }).chat_id, type: "private" } }
      : true;
    return { ok: true, result } as never; // never reaches Telegram
  });
  return { bot, calls, send: (update: Update) => bot.handleUpdate(update) };
}

let id = 1;
const user = (uid: number, first_name: string, username?: string) => ({ id: uid, is_bot: false, first_name, username });

export const updates = {
  text: (chatId: number, text: string): Update => ({
    update_id: id++,
    message: {
      message_id: id++, date: 0, text,
      chat: { id: chatId, type: "private", first_name: "Пётр" },
      from: user(chatId, "Пётр", "petr_test"),
      // commands only match with a bot_command entity at offset 0
      ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] } : {}),
    },
  }) as Update,
  businessConnection: (connId: string, ownerId: number, enabled = true): Update => ({
    update_id: id++,
    business_connection: {
      id: connId, user: user(ownerId, "Менеджер"), user_chat_id: ownerId, date: 0,
      rights: { can_reply: true }, is_enabled: enabled,
    },
  }) as Update,
  businessMessage: (connId: string, chatId: number, fromId: number, text: string): Update => ({
    update_id: id++,
    business_message: {
      message_id: id++, date: 0, text, business_connection_id: connId,
      chat: { id: chatId, type: "private", first_name: "Анна" },
      from: user(fromId, fromId === chatId ? "Анна" : "Менеджер"),
    },
  }) as Update,
};
```

```ts
// src/modules/channels/controllers/intake.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBotHarness, updates } from "../test/bot-harness";

vi.mock("@/modules/leads", () => ({
  leads: {
    ingestInbound: vi.fn().mockResolvedValue({ status: "no_lead" }),
    submitIntake: vi.fn().mockResolvedValue({ leadId: "lead_1" }),
  },
}));
vi.mock("../repositories/intake-session-repository"); // or an in-memory fake implementing the same API

import { leads } from "@/modules/leads";

describe("intake form", () => {
  beforeEach(() => vi.clearAllMocks());

  it("collects name → contact → request and submits exactly once", async () => {
    const { send, calls } = createBotHarness();
    await send(updates.text(1001, "/start"));
    await send(updates.text(1001, "Пётр"));
    await send(updates.text(1001, "+7 (912) 345-67-89"));
    await send(updates.text(1001, "Нужен лендинг для кофейни, бюджет 100к"));

    expect(leads.submitIntake).toHaveBeenCalledTimes(1);
    expect(leads.submitIntake).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Пётр", contact: "+79123456789", contactType: "phone" }),
    );
    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(4);
  });
});
```
