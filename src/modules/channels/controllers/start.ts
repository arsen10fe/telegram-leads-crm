import { Composer } from "grammy";
import { auth } from "@/modules/auth";
import { BOT_CHANNEL, leads } from "@/modules/leads";
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
  const chatId = BigInt(ctx.chat.id);
  // Clients press /start out of habit: with a lead already in this chat that would duplicate it.
  if (await leads.hasLeadInChat(BOT_CHANNEL, chatId)) {
    log.info({ chatId: ctx.chat.id, fix: "DEF-09" }, "/start from a client who already has a lead: no new form");
    await ctx.reply(texts.alreadyHaveRequest, { reply_markup: { remove_keyboard: true } });
    return;
  }
  await startForm(ctx, chatId);
});

// /new: a deliberate separate request — a second lead for the same client.
privateChats.command("new", async (ctx) => {
  log.info({ chatId: ctx.chat.id }, "new request form started by the client");
  await startForm(ctx, BigInt(ctx.chat.id));
});

privateChats.command("cancel", async (ctx) => {
  await intakeSessionRepository.delete(BigInt(ctx.chat.id));
  log.debug({ chatId: ctx.chat.id }, "intake form cancelled");
  await ctx.reply(texts.cancelled, { reply_markup: { remove_keyboard: true } });
});
