import { BotError, GrammyError, HttpError } from "grammy";
import type { Update } from "grammy/types";
import { isDatabaseUnavailable, waitForDatabase as defaultWaitForDatabase } from "@/shared/db-ready";
import { createLogger, errorInfo } from "@/shared/logger";

const log = createLogger("bot");

const DEFAULT_MAX_RETRIES = 3;

export type BotErrorHandlerDeps = {
  /** Runs the whole middleware chain for the update again (`bot.handleUpdate`). */
  handleAgain: (update: Update) => Promise<void>;
  waitForDatabase?: () => Promise<void>;
  maxRetries?: number;
};

function causeOf(error: unknown): unknown {
  return error instanceof BotError ? error.error : error;
}

function logSkipped(updateId: number, cause: unknown): void {
  if (cause instanceof GrammyError) {
    log.error({ updateId, code: cause.error_code, description: cause.description }, "bot api error");
  } else if (cause instanceof HttpError) {
    log.error({ updateId, err: cause.error }, "telegram unreachable");
  } else {
    log.error({ updateId, err: cause }, "bot handler failed");
  }
}

/**
 * `bot.catch` handler. grammY confirms an update to Telegram even when its handler failed, so a
 * database outage would silently lose the lead. For that case the handler waits for the database
 * and handles the same update again; if the database stays down it throws, which stops polling
 * without confirming the update — the worker exits, Docker restarts it and Telegram redelivers.
 * Any other failure is logged and skipped, so one bad update never blocks the bot.
 */
export function createBotErrorHandler(deps: BotErrorHandlerDeps): (error: BotError) => Promise<void> {
  const waitForDatabase = deps.waitForDatabase ?? (() => defaultWaitForDatabase());
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;

  return async (error) => {
    const update = error.ctx.update;
    const updateId = update.update_id;
    let cause: unknown = error.error;

    for (let retry = 1; isDatabaseUnavailable(cause); retry += 1) {
      if (retry > maxRetries) {
        log.fatal(
          { updateId, retries: maxRetries, fix: "DEF-01", ...errorInfo(cause) },
          "database still unavailable: stopping without confirming the update, Telegram will redeliver it",
        );
        throw cause;
      }
      log.warn({ updateId, retry, fix: "DEF-01", ...errorInfo(cause) }, "database unavailable while handling an update: waiting to retry it");
      await waitForDatabase(); // throws after its deadline → polling stops, the update stays unconfirmed
      try {
        await deps.handleAgain(update);
        log.info({ updateId, retry, fix: "DEF-01" }, "update handled after the database came back");
        return;
      } catch (retryError) {
        cause = causeOf(retryError);
      }
    }

    logSkipped(updateId, cause);
  };
}
