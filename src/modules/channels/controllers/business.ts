import { Composer } from "grammy";
import { businessChannelKey, leads } from "@/modules/leads";
import { createLogger, errorInfo } from "@/shared/logger";
import { texts } from "../models/bot-texts";
import {
  fromTelegramConnection,
  getOrFetchConnection,
  upsertConnection,
} from "../services/business-connection-service";

const log = createLogger("bot.business");

// Requirement 2: messages of a personal Telegram account connected via Telegram Business.
// Never replies from here: replies go through channels.sendToLead (manager or autopilot).
export const businessController = new Composer();

businessController.on("business_connection", async (ctx) => {
  const { connection, isNewlyEnabled } = await upsertConnection(fromTelegramConnection(ctx.businessConnection));
  if (!isNewlyEnabled) return;
  try {
    await ctx.api.sendMessage(Number(connection.ownerChatId), texts.businessConnected);
  } catch (error) {
    // The owner may never have opened the bot's own chat; the connection works anyway.
    log.warn({ connectionId: connection.id, ...errorInfo(error) }, "could not confirm the connection to its owner");
  }
});

businessController.on("business_message", async (ctx) => {
  const message = ctx.businessMessage;
  const connectionId = message.business_connection_id;
  if (!connectionId) return; // always set on business messages; guards the optional type
  const connection = await getOrFetchConnection(connectionId, () => ctx.api.getBusinessConnection(connectionId));
  if (!connection?.isEnabled) {
    log.warn({ connectionId }, "business message from an unknown or disabled connection ignored");
    return;
  }
  // An echo of a message we sent on the owner's behalf (the unique key would also catch it).
  if (message.sender_business_bot) return;
  if (!texts.hasClientContent(message)) {
    log.debug({ connectionId, chatId: message.chat.id, fix: "DEF-02" }, "business service message ignored");
    return;
  }

  const isOwner = BigInt(ctx.from.id) === connection.ownerUserId;
  log.debug({ connectionId, chatId: message.chat.id, isOwner }, "business message");
  const base = {
    channelKey: businessChannelKey(connection.id),
    chatId: BigInt(message.chat.id),
    telegramMessageId: message.message_id,
    text: message.text ?? texts.placeholderFor(message),
  };

  if (isOwner) {
    // The owner answered in the Telegram app; stored only if the chat already has a lead.
    await leads.recordManagerMessage({ ...base, via: "telegram_app" });
    return;
  }
  await leads.ingestInbound({
    ...base,
    source: "telegram_account",
    from: ctx.from,
    // The 24-hour reply window counts from Telegram's timestamp, not from when we processed it.
    sentAt: new Date(message.date * 1000),
    createLeadIfMissing: true,
  });
});

businessController.on(["edited_business_message", "deleted_business_messages"], (ctx) => {
  log.debug({ updateId: ctx.update.update_id }, "business edit/delete ignored (MVP keeps CRM history unchanged)");
});
