import { Composer } from "grammy";
import { auth } from "@/modules/auth";
import { createLogger } from "@/shared/logger";
import { texts } from "../models/bot-texts";
import { intakeSessionRepository } from "../repositories/intake-session-repository";
import { startForm } from "./form-helpers";

const log = createLogger("bot.start");

const LINK_PREFIX = "link_";

export const startController = new Composer();
const privateChats = startController.chatType("private");

privateChats.command("start", async (ctx) => {
  const payload = ctx.match.trim();
  // /start link_<token>: a manager connects notifications from the CRM settings, not the form.
  if (payload.startsWith(LINK_PREFIX)) {
    const linked = await auth.linkTelegram({ token: payload.slice(LINK_PREFIX.length), chatId: BigInt(ctx.chat.id) });
    log.info({ chatId: ctx.chat.id, linked }, "manager link attempt");
    await ctx.reply(linked ? texts.notificationsLinked : texts.linkExpired);
    return;
  }
  // A plain /start always (re)starts the form.
  await startForm(ctx, BigInt(ctx.chat.id));
});

privateChats.command("cancel", async (ctx) => {
  await intakeSessionRepository.delete(BigInt(ctx.chat.id));
  log.debug({ chatId: ctx.chat.id }, "intake form cancelled");
  await ctx.reply(texts.cancelled, { reply_markup: { remove_keyboard: true } });
});
