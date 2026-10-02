import { autoRetry } from "@grammyjs/auto-retry";
import { Api } from "grammy";
import { getEnv } from "@/shared/env";
import { AppError } from "@/shared/errors";

/** 429 and 5xx are retried; a send never waits longer than this (a Server Action may be waiting). */
export const AUTO_RETRY_OPTIONS = { maxRetryAttempts: 3, maxDelaySeconds: 10 };

let api: Api | undefined;

export function requireBotToken(): string {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  if (!token) throw new AppError("telegram_not_configured", "TELEGRAM_BOT_TOKEN не задан", 500);
  return token;
}

/**
 * One sending client for both processes. Only the worker owns a Bot (getUpdates); the web process
 * sends manager replies through this Api without polling.
 */
export function telegramApi(): Api {
  if (!api) {
    api = new Api(requireBotToken());
    api.config.use(autoRetry(AUTO_RETRY_OPTIONS));
  }
  return api;
}

/** Tests replace the client with one whose transport is captured. */
export function setTelegramApiForTests(replacement: Api | undefined): void {
  api = replacement;
}
