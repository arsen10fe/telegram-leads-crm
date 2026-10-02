/** Why the AI handed the dialog to a manager (the ai module decides; leads records it). */
export type HandoffReasonValue =
  | "trigger"
  | "turn_cap"
  | "ai_unavailable"
  | "model_requested"
  | "low_confidence"
  | "send_failed";

const HANDOFF_REASON_TEXT: Record<HandoffReasonValue, string> = {
  trigger: "стоп-слово в сообщении клиента",
  turn_cap: "достигнут лимит ответов автопилота",
  ai_unavailable: "AI недоступен",
  model_requested: "AI решил, что нужен менеджер",
  low_confidence: "AI не уверен в ответе",
  send_failed: "не удалось отправить ответ",
};

/** The system note in the thread. */
export function handoffNote(reason: HandoffReasonValue): string {
  return `AI передал диалог менеджеру: ${HANDOFF_REASON_TEXT[reason]}`;
}
