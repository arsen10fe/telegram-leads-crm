// Every Russian text the bot sends lives here.

type IntakeStepName = "name" | "contact" | "request";
type RetryKind = "invalid" | "unsupported";

const ASK: Record<IntakeStepName, string> = {
  name: "Как вас зовут?",
  contact:
    "Как с вами связаться? Нажмите кнопку ниже, чтобы поделиться номером, или напишите телефон, @username или e-mail.",
  request: "Опишите задачу: что нужно сделать, сроки и бюджет — в свободной форме.",
};

const RETRY_INVALID: Record<IntakeStepName, string> = {
  name: "Пожалуйста, напишите имя — от 2 до 100 символов.",
  contact:
    "Не получилось распознать контакт. Пример: +7 999 123-45-67, @username или name@mail.ru. Или нажмите «📱 Поделиться номером».",
  request: "Опишите задачу хотя бы парой слов.",
};

type NonTextMessage = {
  text?: string;
  photo?: unknown;
  voice?: unknown;
  video?: unknown;
  video_note?: unknown;
  animation?: unknown;
  sticker?: unknown;
  document?: unknown;
  audio?: unknown;
  contact?: { phone_number?: string; first_name?: string; last_name?: string };
  location?: { latitude: number; longitude: number };
  venue?: unknown;
  poll?: unknown;
  dice?: unknown;
  caption?: string;
};

const PLACEHOLDERS: Array<[keyof NonTextMessage, string]> = [
  ["photo", "[фото]"],
  ["voice", "[голосовое сообщение]"],
  ["video", "[видео]"],
  ["video_note", "[видео]"],
  ["animation", "[GIF]"],
  ["sticker", "[стикер]"],
  ["document", "[файл]"],
  ["audio", "[аудио]"],
  ["contact", "[контакт]"],
  ["location", "[геолокация]"],
  ["venue", "[место]"],
  ["poll", "[опрос]"],
  ["dice", "[кубик]"],
];

/**
 * Something the client actually sent. Service messages (a pinned message, an auto-delete timer,
 * a chat background, "allowed to write") are Telegram's bookkeeping, not a client message.
 */
function hasClientContent(message: NonTextMessage): boolean {
  return Boolean(message.text ?? message.caption) || PLACEHOLDERS.some(([key]) => message[key]);
}

/** The data a contact card or location carries, so the manager can still use it from the CRM. */
function attachmentDetails(message: NonTextMessage): string | null {
  if (message.contact) {
    const name = [message.contact.first_name, message.contact.last_name].filter(Boolean).join(" ");
    return [name, message.contact.phone_number].filter(Boolean).join(" ") || null;
  }
  if (message.location) return `${message.location.latitude}, ${message.location.longitude}`;
  return null;
}

/** What a non-text message looks like in the CRM thread (media itself stays in Telegram). */
function placeholderFor(message: NonTextMessage): string {
  const kind = PLACEHOLDERS.find(([key]) => message[key])?.[1] ?? "[сообщение]";
  return [kind, attachmentDetails(message), message.caption].filter(Boolean).join(" ");
}

const SOURCE_LABELS: Record<string, string> = {
  bot: "бот",
  telegram_account: "личный Telegram",
  manual: "вручную",
};

const HANDOFF_REASONS: Record<string, string> = {
  trigger: "стоп-слово в сообщении клиента",
  turn_cap: "достигнут лимит ответов автопилота",
  ai_unavailable: "AI недоступен",
  model_requested: "AI решил, что нужен менеджер",
  low_confidence: "AI не уверен в ответе",
  send_failed: "не удалось отправить ответ",
};

export const texts = {
  sourceLabel: (source: string) => SOURCE_LABELS[source] ?? source,
  handoffReasonLabel: (reason: string | null) => (reason ? (HANDOFF_REASONS[reason] ?? reason) : "—"),
  greeting: (agencyName: string) =>
    `Здравствуйте! Это бот агентства «${agencyName}». Оставьте заявку — менеджер свяжется с вами.\n\n${ASK.name}`,
  ask: (step: IntakeStepName) => ASK[step],
  retry: (step: IntakeStepName, kind: RetryKind) =>
    kind === "unsupported" ? `Пожалуйста, ответьте текстом. ${ASK[step]}` : RETRY_INVALID[step],
  sharePhoneButton: "📱 Поделиться номером",
  useTelegramButton: "💬 Пишите в Telegram",
  submitted: (name: string) =>
    `Спасибо, ${name}! Заявка принята — менеджер скоро свяжется с вами.\n\nЕсли захотите что-то добавить, просто напишите сюда.`,
  cancelled: "Хорошо, заявку не отправляем. Чтобы начать заново, нажмите /start.",
  alreadyHaveRequest:
    "Ваша заявка уже у нас. Если хотите что-то добавить — просто напишите сюда, менеджер увидит.\n\nЧтобы оставить новую, отдельную заявку, отправьте /new.",
  managerChatHint:
    "Это ваш чат уведомлений Lidogram: сюда приходят новые лиды и передачи диалогов от AI-ассистента. Отвечать клиентам удобнее из CRM — кнопка «Открыть в CRM» есть в каждом уведомлении.",
  notificationsLinked: "Готово! Сюда будут приходить уведомления о новых лидах и о передачах от AI-ассистента.",
  linkExpired: "Ссылка устарела. Откройте настройки CRM и нажмите «Подключить» ещё раз.",
  businessConnected:
    "Lidogram подключён к вашему Telegram-аккаунту. Новые чаты будут появляться в CRM как лиды.",
  placeholderFor,
  hasClientContent,
  commands: [
    { command: "start", description: "Оставить заявку" },
    { command: "new", description: "Новая заявка" },
    { command: "cancel", description: "Отменить заявку" },
  ],
};
