export type ContextAuthor = "client" | "manager" | "ai";

export type AiPromptContext = {
  lead: { source: string; name: string; contact: string | null; request: string | null };
  messages: Array<{ author: ContextAuthor; text: string }>;
};

const AUTHOR_LABELS: Record<ContextAuthor, string> = { client: "клиент", manager: "менеджер", ai: "AI" };
const SOURCE_LABELS: Record<string, string> = {
  bot: "бот агентства в Telegram",
  telegram_account: "личный Telegram менеджера",
  manual: "добавлен менеджером вручную",
};

export const MAX_CONTEXT_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 1_000;

/** Static part: same inputs → byte-identical output, so OpenAI can cache the prefix. */
export function renderSystem(
  template: string,
  vars: { agency_name: string; knowledge_base: string; tag_names?: string },
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key as keyof typeof vars] ?? "");
}

/**
 * Client-provided text as a quoted JSON string with neutralized angle brackets: it can neither
 * close or reopen the data blocks (no "<"), nor start a fake line like "[менеджер] …" (line breaks
 * stay escaped inside the string).
 */
export function quoteClientText(text: string, max = MAX_MESSAGE_CHARS): string {
  return JSON.stringify(text.slice(0, max).replaceAll("<", "‹").replaceAll(">", "›"));
}

/** Dynamic part, last in the prompt: everything the client could have typed sits inside data blocks. */
export function renderLeadContext(context: AiPromptContext): string {
  const lines = context.messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => `[${AUTHOR_LABELS[message.author]}] ${quoteClientText(message.text)}`);
  return [
    `Источник лида: ${SOURCE_LABELS[context.lead.source] ?? context.lead.source}`,
    "",
    "<client_data>",
    `Имя: ${quoteClientText(context.lead.name, 100)}`,
    `Контакт: ${quoteClientText(context.lead.contact ?? "—", 100)}`,
    `Заявка: ${quoteClientText(context.lead.request ?? "—")}`,
    "</client_data>",
    "",
    "<client_messages>",
    ...lines,
    "</client_messages>",
  ].join("\n");
}
