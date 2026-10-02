// The bot process: the only consumer of Telegram updates for this token, plus the job runner.
// Started with `npm run bot:dev` (dev bot token) or `npm run worker` / the `bot` compose service.
import type { Bot } from "grammy";
import { ALLOWED_UPDATES, createBot, texts } from "@/modules/channels";
import { disconnectDb } from "@/shared/db";
import { waitForDatabase } from "@/shared/db-ready";
import { getEnv } from "@/shared/env";
import { startJobRunner, type JobRunner } from "@/shared/jobs";
import { createLogger } from "@/shared/logger";
import { jobFinalFailureHandlers, jobHandlers } from "./job-handlers";

const log = createLogger("worker");

let bot: Bot | undefined;
let runner: JobRunner | undefined;
let stopping = false;

async function shutdown(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ reason }, "worker stopping");
  // The current job finishes first; then polling stops, so no update is left half-handled.
  await runner?.stop();
  await bot?.stop();
  await disconnectDb();
  log.info("worker stopped");
}

async function main(): Promise<void> {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN) {
    log.fatal("TELEGRAM_BOT_TOKEN is not set: the bot worker cannot start");
    process.exitCode = 1;
    return;
  }

  // After a host reboot Docker may start this container before Postgres. Telegram's backlog is
  // consumed only once the database answers; otherwise every insert fails and those leads are lost.
  await waitForDatabase();

  bot = createBot(env.TELEGRAM_BOT_TOKEN);
  try {
    await bot.api.setMyCommands(texts.commands);
  } catch (error) {
    log.warn({ err: error }, "setMyCommands failed; continuing");
  }

  runner = startJobRunner({ handlers: jobHandlers, onFinalFailure: jobFinalFailureHandlers });

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  // Long polling only. Pending updates are leads, so they are never dropped.
  await bot.start({
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: false,
    onStart: (me) => log.info({ username: me.username, allowedUpdates: ALLOWED_UPDATES }, "bot started"),
  });
}

try {
  await main();
} catch (error) {
  log.fatal({ err: error }, "worker crashed");
  process.exitCode = 1;
  await shutdown("crash");
}
