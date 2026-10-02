---
name: telegram-lead-bot
description: "Builds the Telegram side of the Lidogram mini-CRM with grammY: the bot intake form that turns a chat into a lead, Telegram Business messages from a connected personal account (Secretary Mode), replies to leads via the bot chat or business_connection_id within the 24-hour window, manager notifications, long polling in the worker, and bot tests via bot.handleUpdate. Use when changing bot handlers, the intake form, Business handling, sendToLead, notifications, or allowed_updates. Not for AI logic (see lead-ai-pipeline)."
metadata:
  author: ai-factory
  version: "1.0"
  category: integration
---

# Telegram Lead Bot (grammY)

Telegram is the lead source the reviewers test first: **message to the bot → lead with a tag in the
CRM**. Everything here serves that path: fast, idempotent, never blocked by AI.

Read `.ai-factory/ARCHITECTURE.md` first; this skill implements its `channels` module.
Detailed knowledge: [references/GUIDE.md](references/GUIDE.md). Copy-ready code:
[references/EXAMPLES.md](references/EXAMPLES.md).

## Where the Code Lives

```
src/modules/channels/
├── index.ts                    # public API: createBot, sendToLead, notifyManagers, linkManager…
├── create-bot.ts               # Bot + autoRetry + bot.catch + controllers; ALLOWED_UPDATES
├── controllers/                # grammY handlers only (thin): start.ts, intake.ts, business.ts, link.ts
├── models/                     # pure: intake-form.ts (step machine), contact.ts, bot-texts.ts (Russian)
├── repositories/               # intake-session-repository.ts, business-connection-repository.ts
├── services/                   # send-to-lead-service.ts, notify-service.ts, link-service.ts
└── adapters/                   # telegram-api.ts (shared Api client), telegram-html.ts (escape/truncate)
src/worker/main.ts              # the ONLY place that calls bot.start()
```

- Controllers parse the update and call services/`leads` public API. No Prisma, no business rules,
  **no OpenAI** in controllers.
- `leads` never imports `channels`. AI and notifications reach Telegram through jobs and
  `channels.sendToLead` / `channels.notifyManagers`.

## Process Rules (non-negotiable)

1. **Exactly one consumer per token.** Only the `bot` worker runs `bot.start()`. Local development
   uses a **separate dev bot token**. Two pollers → `409 Conflict`; a leftover webhook silently
   starves polling. Check `getWebhookInfo` first when "the bot stopped responding".
2. **Explicit `allowed_updates`, never `drop_pending_updates`.** Pending updates are leads.
   ```ts
   export const ALLOWED_UPDATES = [
     "message", "callback_query",
     "business_connection", "business_message",
     "edited_business_message", "deleted_business_messages",
   ] as const;
   ```
   Telegram remembers the last `allowed_updates`. If you omit it, the previous list stays active.
3. **Graceful shutdown:** `process.once("SIGTERM", () => bot.stop())` (and `SIGINT`). This avoids
   409s while the old container is still polling during a redeploy.
4. **Long polling is sequential** (one update at a time). That is correct here: handlers only touch
   the DB, so per-chat order is preserved without `@grammyjs/runner`.
5. **Webhook mode is optional** (`TELEGRAM_MODE=webhook`): `webhookCallback(bot, "std/http",
   { secretToken })` in `src/app/api/telegram/webhook/route.ts`; never call `bot.start()` in that
   mode. The secret is mandatory. Handlers must finish well under grammY's 10 s webhook timeout, or
   Telegram retries the update.
6. **One shared `Api` client for sending** (`adapters/telegram-api.ts`: `new Api(token)` +
   `autoRetry`). The web process sends replies with it without constructing a `Bot`.

## Intake Form (requirement 1)

A persisted step machine, not `@grammyjs/conversations` and not in-memory sessions (state must
survive deploys).

| Step | Bot asks (Russian, from `bot-texts.ts`) | Accepts | On invalid input |
|------|------------------------------------------|---------|------------------|
| `name` | «Как вас зовут?» | text, 2–100 chars | re-ask with hint |
| `contact` | «Как с вами связаться?» + keyboard [📱 Поделиться номером] [💬 Пишите в Telegram] | `message.contact`, phone, `@username`, e-mail, or the Telegram button | re-ask with examples |
| `request` | «Опишите задачу: что нужно, сроки, бюджет — как удобно» | text, ≥ 3 chars (cap 2000) | re-ask |
| done | deterministic confirmation, keyboard removed | — | — |

- `IntakeSession` row keyed by `telegramChatId` holds `step` and `data`. Update it on every step.
  A session older than 24 h restarts.
- `/start` (no payload) resets the form; `/cancel` deletes the session. `/start link_<token>` is
  manager linking, **not** the form.
- **Completion is one call:** `leads.submitIntake({...})`. One transaction creates the lead
  (`source=bot`) and the inbound message (the request, with its `telegramMessageId`), deletes the
  session, and enqueues the `qualify_lead` / `notify_new_lead` (and `autopilot_reply`) jobs. Then
  reply with fixed text. Do not wait for AI.
- **Non-text input** during a text step (photo, sticker, voice) gets a short "please answer with
  text" re-ask. Never crash, never skip the step.
- **Free messages** in a chat with no active session go to `leads.ingestInbound`. They append to the
  latest lead of this chat; if the chat has no lead yet, start the form instead.
- Validate and normalize contacts in `models/contact.ts` (pure, unit-tested): phone → `+7…` digits,
  `@username` (5–32 chars, `[A-Za-z0-9_]`), e-mail. The "Пишите в Telegram" button stores
  `@username`, or `tg://user?id=<id>` when the user has no username.

## Telegram Business (requirement 2)

Prerequisites: **Secretary Mode** enabled for the bot in @BotFather. The account owner has
Telegram Premium and adds the bot in Settings → Telegram Business → Chatbots. Recommend chat access
"new chats + non-contacts".

- **`business_connection`** → upsert `BusinessConnection`: `id`, owner `user.id`, `user_chat_id`,
  name, `rights?.can_reply ?? false`, `is_enabled`. The CRM Settings page shows this status. On a
  newly enabled connection you may send the owner a confirmation via `user_chat_id`.
- **`business_message`:**
  1. Load the connection from the DB (fallback `ctx.getBusinessConnection()` + upsert). Ignore the
     message if the connection is disabled.
  2. Ignore echoes of our own sends (`msg.sender_business_bot` is set). Idempotency also catches
     them.
  3. If `ctx.from.id === connection.ownerUserId`, the owner typed it in Telegram →
     `leads.recordManagerMessage` (only when a lead exists for this chat).
  4. Otherwise it's a customer → `leads.ingestInbound({ channelKey: "biz:<id>", source:
     "telegram_account", ... })`. A new chat creates the lead.
- `edited_business_message` / `deleted_business_messages`: log at `debug`, keep CRM history
  unchanged (MVP).
- **Never reply from the controller.** Replies on behalf of the owner come only from
  `channels.sendToLead`, called by the manager (web) or the autopilot job (worker). Business leads
  default to **copilot** mode.
- grammY's `ctx.reply` inside a business update automatically sends on behalf of the account
  (`ctx.businessConnectionId`). Bots cannot forward or copy messages from managed chats.

## Sending to a Lead (`channels.sendToLead`)

The one outbound path, used by Server Actions (manager reply, approved draft) and by the autopilot
job:

1. Resolve the channel from the lead: `channelKey = "bot"` → bot chat; `"biz:<id>"` → add
   `business_connection_id`. Manual leads have no channel → `{ ok: false, reason: "no_channel" }`.
2. **Business window guard before calling Telegram:** the connection is enabled, `canReply` is true,
   and `lead.lastInboundAt` is within 24 h. Otherwise → `{ ok: false, reason:
   "business_window_closed" }`. The UI explains it.
3. Send manager/AI text as **plain text (no `parse_mode`)**: nothing to escape, nothing to break.
   Reject texts over 4000 chars at validation time.
4. On success, store `Message(direction=outbound, author, telegramMessageId)` and return
   `{ ok: true, messageId }`.
5. Map errors, never throw to the UI:
   - `GrammyError` 403 → `"blocked"` (user blocked the bot or never started it);
   - other 4xx → `"rejected"` (log `description`);
   - `HttpError` → `"network"`.
   Store the attempt with `deliveryError` so the manager sees it in the thread.
6. 429 and 5xx are retried by `autoRetry` (`maxDelaySeconds: 10`). Telegram limits: ~1 message per
   second per chat; ~30 messages per second for broadcasts.

## Manager Notifications

- **Linking:** Settings shows a deep link `https://t.me/<bot>?start=link_<token>`, where `token` is
  random URL-safe ≤ 48 chars stored on `User`. `/start link_<token>` sets `User.telegramChatId` and
  clears the token. A bot cannot message someone who never started it.
- **`notifyManagers({ kind: "new_lead" | "handoff", leadId })`** runs as a job after the commit:
  - HTML message, **truncate then escape** every interpolated value;
  - inline URL button «Открыть в CRM» → `${APP_URL}/leads/<id>`. If `APP_URL` isn't a public https
    URL (local dev), put the link in the text instead.
  - A failure for one manager (403) is logged and doesn't fail the others.

## Testing

- **Pure models first:** `intake-form.ts` transitions, `contact.ts` normalization. No grammY or DB
  involved.
- **Controllers:** build the real bot with `new Bot("test", { botInfo })` (no `getMe` call). Install
  a transformer that records `(method, payload)` and returns fake results. Feed sample updates with
  `await bot.handleUpdate(update)` and assert recorded calls and `leads.*` calls (mocked with
  `vi.mock("@/modules/leads")`).
- **Must-have cases:**
  - full form → `submitIntake` called once;
  - invalid contact re-asks;
  - photo during the request step;
  - `/start` mid-form resets it;
  - Business customer message → `ingestInbound`;
  - owner message → `recordManagerMessage`;
  - disabled connection ignored;
  - `sendToLead` window closed → no API call;
  - 403 → `"blocked"`.
- **Webhook mode:** a request without or with a wrong secret header gets 401.

## Environment

| Var | Purpose |
|-----|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token (prod and dev bots are different tokens) |
| `TELEGRAM_BOT_USERNAME` | For deep links (`t.me/<bot>?start=…`) |
| `TELEGRAM_MODE` | `polling` (default) or `webhook` |
| `TELEGRAM_WEBHOOK_SECRET` | Required only in webhook mode; 1–256 chars `A-Za-z0-9_-` |
| `APP_URL` | Public CRM URL for notification links |

Never commit or log tokens. Log `chatId`/`leadId`, not message bodies, at `info`.

## Anti-Patterns

- ❌ Calling OpenAI, `sendToLead`, or slow work inside an update handler.
- ❌ In-memory sessions, `drop_pending_updates: true`, two pollers, polling while a webhook is set.
- ❌ Replying to Business customers from the controller, or replying after the 24 h window without
  the guard.
- ❌ `parse_mode: "HTML"` with unescaped client text; escaping before truncating.
- ❌ Treating the owner's own Business messages as new leads.
- ❌ Check-then-insert for message idempotency (rely on the unique key + `P2002`).
