import { Composer, type Context } from "grammy";
import { BOT_CHANNEL, leads, parseContact, parsePhone, telegramContact } from "@/modules/leads";
import { createLogger } from "@/shared/logger";
import { texts } from "../models/bot-texts";
import { advanceIntake, type CompletedIntake, type IntakeInput } from "../models/intake-form";
import { intakeSessionRepository } from "../repositories/intake-session-repository";
import { replyMarkupFor, startForm } from "./form-helpers";

const log = createLogger("bot.intake");

export const intakeController = new Composer();
const privateChats = intakeController.chatType("private");

function toIntakeInput(ctx: Context): IntakeInput {
  const message = ctx.message;
  if (message?.contact) return { kind: "shared_phone", contact: parsePhone(message.contact.phone_number) };
  if (message?.text === texts.useTelegramButton && ctx.from) {
    return { kind: "use_telegram", contact: telegramContact(ctx.from) };
  }
  if (message?.text) return { kind: "text", text: message.text, contact: parseContact(message.text) };
  return { kind: "unsupported" };
}

/** No form in progress: append to the chat's lead, or start the form when there is none. */
async function handleFreeMessage(ctx: Context & { chat: { id: number } }, chatId: bigint): Promise<void> {
  const message = ctx.message;
  if (!message) return;
  const result = await leads.ingestInbound({
    source: "bot",
    channelKey: BOT_CHANNEL,
    chatId,
    telegramMessageId: message.message_id,
    text: message.text ?? texts.placeholderFor(message),
    from: ctx.from,
    createLeadIfMissing: false,
  });
  if (result.status === "no_lead") await startForm(ctx, chatId);
}

/** Lead + request message + jobs in one transaction; the form session is cleared inside it. */
async function submit(ctx: Context, chatId: bigint, lead: CompletedIntake): Promise<void> {
  const message = ctx.message;
  if (!message) return;
  const result = await leads.submitIntake(
    { chatId, telegramMessageId: message.message_id, from: ctx.from, ...lead },
    { inTransaction: (tx) => intakeSessionRepository.delete(chatId, tx) },
  );
  if (result.status === "duplicate") {
    log.debug({ chatId: String(chatId) }, "intake re-delivered: already submitted");
    return;
  }
  log.info({ leadId: result.leadId, chatId: String(chatId) }, "intake submitted");
  // Deterministic text: the client never waits for AI. Plain text, so the name needs no escaping.
  await ctx.reply(texts.submitted(lead.name), { reply_markup: { remove_keyboard: true } });
}

privateChats.on("message", async (ctx) => {
  const chatId = BigInt(ctx.chat.id);
  const session = await intakeSessionRepository.findActive(chatId);
  if (!session) {
    await handleFreeMessage(ctx, chatId);
    return;
  }

  const input = toIntakeInput(ctx);
  const transition = advanceIntake(session.step, session.data, input);
  if (transition.kind === "complete") {
    await submit(ctx, chatId, transition.lead);
    return;
  }

  await intakeSessionRepository.save(chatId, transition.step, transition.data);
  log.debug({ chatId: String(chatId), from: session.step, to: transition.step, retry: transition.retry }, "intake step");
  if (transition.retry === "unsupported") {
    log.warn({ chatId: String(chatId), step: session.step, kind: input.kind }, "unsupported input in intake form");
  }
  const prompt = transition.retry ? texts.retry(transition.step, transition.retry) : texts.ask(transition.step);
  await ctx.reply(prompt, replyMarkupFor(transition.step));
});
