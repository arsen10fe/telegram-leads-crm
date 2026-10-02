import { Keyboard, type Context } from "grammy";
import { settings } from "@/modules/settings";
import { createLogger } from "@/shared/logger";
import { texts } from "../models/bot-texts";
import type { IntakeStep } from "../models/intake-form";
import { intakeSessionRepository } from "../repositories/intake-session-repository";

const log = createLogger("bot.intake");

export const contactKeyboard = new Keyboard()
  .requestContact(texts.sharePhoneButton)
  .row()
  .text(texts.useTelegramButton)
  .resized()
  .oneTime();

/** (Re)starts the form at the name step. */
export async function startForm(ctx: Context, chatId: bigint): Promise<void> {
  await intakeSessionRepository.save(chatId, "name", {});
  const agency = await settings.get();
  log.debug({ chatId: String(chatId), to: "name" }, "intake form started");
  await ctx.reply(texts.greeting(agency.agencyName), { reply_markup: { remove_keyboard: true } });
}

export function replyMarkupFor(step: IntakeStep) {
  return step === "contact" ? { reply_markup: contactKeyboard } : {};
}
