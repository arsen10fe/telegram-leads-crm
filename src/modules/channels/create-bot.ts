import { autoRetry } from "@grammyjs/auto-retry";
import { Bot, type BotConfig, type Context } from "grammy";
import { createLogger } from "@/shared/logger";
import { AUTO_RETRY_OPTIONS } from "./adapters/telegram-api";
import { createBotErrorHandler } from "./bot-error-handler";
import { businessController } from "./controllers/business";
import { intakeController } from "./controllers/intake";
import { startController } from "./controllers/start";

const log = createLogger("bot");

/**
 * Telegram remembers the last list, so it is always passed explicitly. Business updates are
 * requirement 2; `callback_query` is answered by grammY plugins if ever used.
 */
export const ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
] as const;

function updateType(ctx: Context): string {
  return Object.keys(ctx.update).find((key) => key !== "update_id") ?? "unknown";
}

/**
 * Builds the bot with all controllers. Only the worker calls `bot.start()`; tests feed updates
 * through `bot.handleUpdate` with a captured transport.
 */
export function createBot(token: string, options?: BotConfig<Context>): Bot {
  const bot = new Bot(token, options);
  bot.api.config.use(autoRetry(AUTO_RETRY_OPTIONS));

  bot.use(async (ctx, next) => {
    log.debug({ updateId: ctx.update.update_id, type: updateType(ctx), chatId: ctx.chat?.id }, "update");
    await next();
  });

  bot.use(startController); // /start, /cancel — before the form
  bot.use(businessController); // business_* updates (requirement 2)
  bot.use(intakeController); // form steps and free messages — keep last

  // A database outage must not lose the update: see createBotErrorHandler.
  bot.catch(createBotErrorHandler({ handleAgain: (update) => bot.handleUpdate(update) }));

  return bot;
}
