# Telegram Lead Bot — Knowledge Base

Synthesized from the official grammY and Telegram docs (fetched 2026-10-02, Bot API 10.3) and from
the team's own shipped bots: meet_ai, calendarmeet, app_sale/invest, app_sale/auto_send, cashback,
room8-crew. Where a source did not cover something, this guide says so instead of guessing.

## 1. Telegram Business for Bots

**Setup (owner side).**
- The bot owner enables **Secretary Mode** in @BotFather (Telegram's features page: "Enable
  Secretary Mode for your bot in @BotFather").
- A user then connects the bot to their account in Telegram Settings → Business → Chatbots and
  "specifies which chats the bot accesses".
- Telegram Business is a Telegram Premium feature. The official features page does not restate
  this; our demo account has Premium.

**What the bot gets.**
- Update types (Bot API):
  - `business_connection` — "The bot was connected to or disconnected from a business account, or a
    user edited an existing connection with the bot".
  - `business_message` — "New message from a connected business account".
  - `edited_business_message` — "New version of a message from a connected business account".
  - `deleted_business_messages` — "Messages were deleted from a connected business account".
- The connection object carries:
  - the business account user (`user`);
  - `user_chat_id`, the private chat with that user;
  - `is_enabled`;
  - the bot's rights in managed chats (`rights`, e.g. `can_reply`, `can_read_messages`,
    `can_delete_all_messages`).
- `Message.business_connection_id`: "Unique identifier of the business connection from which the
  message was received".
- `Message.sender_business_bot`: "The bot that actually sent the message on behalf of the business
  account. Available only for outgoing messages sent on behalf of the connected business account."

**Who wrote the message.** A `business_message` arrives for **both** chat participants: the customer
and the account owner (the owner typing in their own Telegram app). From the grammY docs:

```ts
bot.on("business_message", async (ctx) => {
  const conn = await ctx.getBusinessConnection();
  const employee = conn.user;
  if (ctx.from.id === employee.id) {
    // You sent this message.
  } else {
    // Your customer sent this message.
    if (conn.rights?.can_reply) {
      // You can reply to this message.
    }
  }
});
```

**Sending.**
- The bot "is able to send messages to this chat without being a member of the chat". `ctx.reply`
  works as expected because grammY uses the `ctx.businessConnectionId` shortcut. Outside an update
  context, pass `business_connection_id` to `sendMessage`.
- Messages appear as authored by the business account, not the bot.
- Telegram's features page: bots can reply "in private chats with incoming messages in the last
  24 hours", and "some actions are limited to eligible private chats with recent incoming messages
  and require a `business_connection_id`".
- The exact error text Telegram returns outside the window is not documented on the pages we read.
  Guard proactively (`lastInboundAt` < 24 h and `can_reply`) and treat any 4xx on a business send
  as "rejected".

**Other operations.**
- `ctx.editMessageText(...)` works in managed chats.
- `ctx.deleteBusinessMessages([...ids])` requires `can_delete_all_messages`.
- Limitation from grammY docs: "Bots cannot forward or copy messages from managed chats."
- Deep link: when the owner opens bot management for a specific chat, `/start` receives a payload
  starting with `bizChat` followed by the chat id. We don't need it for the MVP.
- grammY also documents filter queries such as `business_connection:is_enabled`. We read
  `ctx.businessConnection` fields directly, which works regardless of filter support.

## 2. Long Polling vs Webhooks (grammY)

| | Long polling | Webhooks |
|---|---|---|
| How | grammY asks Telegram for updates (30 s server-side timeout, up to 100 updates per response) | Telegram POSTs each update to your public HTTPS URL |
| Setup | `bot.start()` — no domain or SSL needed | web framework adapter + `setWebhook` |
| Fits | 24/7 backends, local dev | serverless / autoscaling |

- **Long polling processes updates sequentially by default.** For concurrency, grammY points to
  `@grammyjs/runner` plus `sequentialize`. We don't need it: our handlers are DB-only and per-chat
  ordering matters more than throughput.
- **Webhook timeout:** `webhookCallback` has a 10-second default. "If middleware exceeds this, it
  throws an error. Telegram then retries the update, causing duplicate processing and potential
  message spam." grammY's advice: put long-running tasks in a queue and respond fast. That is our
  job queue.
- **Never call `bot.start()` in webhook mode.** Register the webhook with
  `bot.api.setWebhook(url, { secret_token, allowed_updates })`. Webhook and polling are mutually
  exclusive. Delete the webhook (without dropping pending updates) before polling again.
- **Graceful shutdown** (grammY reliability guide):
  ```ts
  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());
  await bot.start();
  ```

## 3. Updates and `allowed_updates`

- Default (empty list): "all update types except `chat_member`, `message_reaction`, and
  `message_reaction_count`". Business updates are therefore included by default.
- Telegram **remembers** the last `allowed_updates` value. If you omit it, the previous setting stays.
  Always pass our explicit list on `bot.start()` / `setWebhook()`.
- `bot.start({ allowed_updates: [...] })` is the documented way to pass the list in polling mode.

## 4. Errors (grammY)

- **Long polling:** install `bot.catch(handler)`. The handler receives a `BotError` with `err.ctx`
  (the context) and `err.error` (the original error). Without it, an error stops the bot.
- **Webhooks:** errors propagate to the web framework.
- **`GrammyError`:** the Bot API returned `ok: false`. It has `error_code` and `description`; for 429
  also `parameters.retry_after`.
- **`HttpError`:** Telegram could not be reached (network). Details are in `.error`.
- **`composer.errorBoundary(handler)`** isolates errors of a group of middleware; the handler can
  call `next` to continue outside the boundary.
- The errors page does not prescribe handling for 403/429. Our policy:
  - 403 (blocked / never started) → mark the delivery failed, don't retry;
  - 429 / 5xx / network → `@grammyjs/auto-retry`.

## 5. `@grammyjs/auto-retry`

```ts
import { autoRetry } from "@grammyjs/auto-retry";
bot.api.config.use(autoRetry());
```

- Retries:
  - **429**, honoring `retry_after`;
  - **5xx**, with exponential backoff from 3 s to 1 h;
  - **network errors** (`HttpError`).
- Options:
  - `maxRetryAttempts`;
  - `maxDelaySeconds` — fail immediately if the required wait is longer;
  - `rethrowInternalServerErrors`;
  - `rethrowHttpErrors`.
- Caveat from the docs: a rate-limited call "will look like the request just takes unusually long".
  Cap `maxDelaySeconds` (we use 10) so a Server Action waiting on a send doesn't hang.

## 6. Telegram Rate Limits (Bot FAQ)

- "In a single chat, avoid sending more than one message per second. We may allow short bursts that
  go over this limit, but eventually you'll begin receiving 429 errors."
- "In a group, bots are not be able to send more than 20 messages per minute."
- "For bulk notifications, bots are not able to broadcast more than about 30 messages per second,
  unless they enable paid broadcasts to increase the limit."
- Message text length: the Bot API caps `sendMessage` text at 4096 characters after entity parsing.
  We validate ≤ 4000 for headroom. The team learned this the hard way (auto_send).

## 7. Testing (grammY deployment checklist)

- "Mock outgoing API requests using transformer functions."
  - A transformer has the signature `(prev, method, payload, signal)` and is installed with
    `bot.api.config.use(...)`.
  - Returning a fake object instead of calling `prev` prevents real API calls.
- "Define and send sample update objects to your bot via `bot.handleUpdate`."
- Pass `botInfo` to the `Bot` constructor to skip the `getMe` call. That also makes `handleUpdate`
  usable without network.
- Commands only match when the update carries a `bot_command` entity at offset 0. Sample updates
  must include it.

## 8. Lessons from Our Previous Bots

| Lesson | Where it came from |
|---|---|
| A webhook needs a secret check, and that check needs a test: 401 without the header, 401 with a wrong one, 200 with the right one | meet_ai (verified in prod), calendarmeet e2e |
| `drop_pending_updates: true` throws away updates that arrived during downtime — for a CRM those are leads | meet_ai, room8-crew used it; wrong for us |
| In-memory form state is lost on every deploy → persist it (Postgres table of its own) | invest, cashback, tast_bot, vic_fb; benzin stored FSM in Postgres |
| Save the inbound message before CRM/AI work; notify only after commit | invest lost "orphan" leads when CRM calls failed |
| Escape every external value in HTML messages; truncate before escaping | meet_ai (group title `Otty <> UAP` broke a send), aif-handoff |
| A bot cannot message a user who never pressed /start → link managers via deep link | calendarmeet (one-time code), invest (`TelegramForbiddenError`) |
| Only one `getUpdates` consumer per token; polling while a webhook is set gets nothing | auto_send, calendarmeet docs, aif-handoff (≥25 s graceful shutdown to avoid 409) |
| Don't attach a reply keyboard to a message you'll edit later ("message can't be edited") | aif-handoff patch |
| Privacy mode hides group text → design for private chats only | calendarmeet patch |
| A button without a handler spins forever → answer every callback query | tg stat review |

## Sources

- https://grammy.dev/advanced/business
- https://core.telegram.org/bots/features#bots-for-business
- https://core.telegram.org/bots/api (Update, Message business fields; Bot API 10.3, 2026-08-24)
- https://grammy.dev/guide/deployment-types
- https://grammy.dev/guide/errors
- https://grammy.dev/plugins/auto-retry
- https://grammy.dev/advanced/transformers
- https://grammy.dev/advanced/deployment (testing checklist) and https://grammy.dev/advanced/reliability (graceful shutdown)
- https://core.telegram.org/bots/faq (rate limits)
- Local: `calendarmeet/.claude/skills/telegram-bot-nextjs` (team skill), research of meet_ai,
  app_sale/invest, app_sale/auto_send, cashback, room8-crew, aif-handoff patches
