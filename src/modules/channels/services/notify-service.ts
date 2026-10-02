import { GrammyError, HttpError, InlineKeyboard } from "grammy";
import { auth } from "@/modules/auth";
import { leads, type LeadSummary } from "@/modules/leads";
import { getEnv, isHttpsUrl } from "@/shared/env";
import { createLogger, errorInfo } from "@/shared/logger";
import { telegramApi } from "../adapters/telegram-api";
import { safe } from "../adapters/telegram-html";
import { texts } from "../models/bot-texts";

const log = createLogger("channels.notify");

export type NotificationKind = "new_lead" | "handoff";

export type FormattedNotification = { text: string; buttonUrl: string | null };

/**
 * HTML notification. Every interpolated value is truncated and then escaped. The «Open in CRM»
 * button needs a public https URL; in local development the link goes into the text instead.
 */
export function formatNotification(kind: NotificationKind, lead: LeadSummary, appUrl: string): FormattedNotification {
  const url = `${appUrl.replace(/\/+$/, "")}/leads/${lead.id}`;
  const buttonUrl = isHttpsUrl(url) ? url : null;
  const header =
    kind === "new_lead"
      ? `🆕 <b>Новый лид</b> · ${safe(texts.sourceLabel(lead.source), 40)}`
      : "🙋 <b>Нужен менеджер</b>";
  const lines = [
    header,
    `<b>${safe(lead.name, 100)}</b>${lead.contact ? ` · ${safe(lead.contact, 100)}` : ""}`,
    kind === "handoff" ? `Причина: ${safe(texts.handoffReasonLabel(lead.handoffReason), 120)}` : null,
    lead.summary ? `AI: ${safe(lead.summary, 300)}` : lead.request ? `Запрос: ${safe(lead.request, 300)}` : null,
    lead.tags.length > 0 ? `Теги: ${safe(lead.tags.join(", "), 200)}` : null,
    buttonUrl ? null : safe(url, 300),
  ];
  return { text: lines.filter((line) => line !== null).join("\n"), buttonUrl };
}

/**
 * Notifies every manager who linked Telegram. Best effort: one failing manager never stops the
 * others. Throws (so the job retries) only when nobody got it because Telegram was unreachable.
 */
export async function notifyManagers(input: { kind: NotificationKind; leadId: string }): Promise<void> {
  const lead = await leads.getLeadSummary(input.leadId);
  if (!lead) {
    log.warn({ leadId: input.leadId, kind: input.kind }, "notification skipped: lead not found");
    return;
  }
  const recipients = await auth.listTelegramRecipients();
  if (recipients.length === 0) {
    log.debug({ leadId: lead.id, kind: input.kind }, "no managers linked Telegram: notification skipped");
    return;
  }

  const { text, buttonUrl } = formatNotification(input.kind, lead, getEnv().APP_URL);
  let sent = 0;
  let networkFailures = 0;
  for (const chatId of recipients) {
    try {
      await telegramApi().sendMessage(Number(chatId), text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: buttonUrl ? new InlineKeyboard().url("Открыть в CRM", buttonUrl) : undefined,
      });
      sent += 1;
    } catch (error) {
      if (error instanceof HttpError) networkFailures += 1;
      const code = error instanceof GrammyError ? error.error_code : undefined;
      log.warn({ leadId: lead.id, kind: input.kind, code, ...errorInfo(error) }, "notification to a manager failed");
    }
  }

  log.info({ kind: input.kind, leadId: lead.id, recipients: recipients.length, sent }, "notification sent");
  if (sent === 0 && networkFailures > 0) throw new Error("Telegram unreachable: no manager was notified");
}
