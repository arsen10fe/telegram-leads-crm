// Russian UI labels for enum values. Client-safe: no module imports.

export const SOURCE_LABELS: Record<string, string> = {
  bot: "Бот",
  telegram_account: "Telegram (личный)",
  manual: "Вручную",
};

export const AI_MODE_LABELS: Record<string, string> = {
  autopilot: "Автопилот",
  copilot: "Копилот",
  off: "AI выключен",
};

export const AI_MODE_DESCRIPTIONS: Record<string, string> = {
  autopilot: "AI отвечает клиенту сам по базе знаний и передаёт диалог менеджеру, когда нужно.",
  copilot: "AI предлагает черновик ответа, отправляет менеджер.",
  off: "AI не участвует в переписке. Квалификация и теги работают.",
};

export const TEMPERATURE_LABELS: Record<string, string> = {
  hot: "Горячий",
  warm: "Тёплый",
  cold: "Холодный",
};

export const SERVICE_LABELS: Record<string, string> = {
  website: "Сайт",
  landing: "Лендинг",
  telegram_bot: "Telegram-бот",
  ads: "Реклама",
  smm: "SMM",
  design: "Дизайн",
  other: "Другое",
};

export const URGENCY_LABELS: Record<string, string> = {
  low: "Не срочно",
  normal: "Обычная",
  high: "Срочно",
};

/** Why the AI handed the dialog to a manager. */
export const HANDOFF_REASON_LABELS: Record<string, string> = {
  trigger: "стоп-слово в сообщении клиента",
  turn_cap: "достигнут лимит ответов автопилота",
  ai_unavailable: "AI недоступен",
  model_requested: "AI решил, что нужен менеджер",
  low_confidence: "AI не уверен в ответе",
  send_failed: "не удалось отправить ответ",
};

/** Why an outbound message was not delivered (SendFailure codes of channels.sendToLead). */
export const DELIVERY_ERROR_LABELS: Record<string, string> = {
  blocked: "клиент заблокировал бота",
  business_window_closed: "прошло больше 24 часов с последнего сообщения клиента",
  rejected: "Telegram отклонил сообщение",
  network: "нет связи с Telegram",
  no_channel: "у лида нет канала связи",
  too_long: "сообщение слишком длинное",
  empty: "пустое сообщение",
};

export function labelFor(labels: Record<string, string>, value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  return labels[value] ?? value;
}
