import { CircleAlert, Info, Sparkles } from "lucide-react";
import { formatTime } from "@/lib/format";
import { DELIVERY_ERROR_LABELS, HANDOFF_REASON_LABELS, labelFor } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { LeadMessageView } from "@/modules/leads";
import { APP_TIMEZONE, toAppDateKey } from "@/shared/time";
import { ThreadAutoScroll } from "./ThreadAutoScroll";

const dayFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: APP_TIMEZONE, day: "numeric", month: "long" });

function authorLabel(message: LeadMessageView, clientName: string): string {
  if (message.author === "client") return clientName;
  if (message.author === "ai") return "AI-ассистент";
  if (message.meta?.via === "telegram_app") return "Менеджер · из Telegram";
  return "Менеджер";
}

function SystemNote({ message }: { message: LeadMessageView }) {
  const reason = typeof message.meta?.reason === "string" ? message.meta.reason : null;
  return (
    <div className="flex justify-center">
      <div className="flex max-w-md items-start gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span className="whitespace-pre-wrap">
          {message.text}
          {reason && !message.text.includes(":") ? ` (${labelFor(HANDOFF_REASON_LABELS, reason)})` : null}
          <span className="ml-2 opacity-70">{formatTime(message.createdAt)}</span>
        </span>
      </div>
    </div>
  );
}

function Bubble({ message, clientName }: { message: LeadMessageView; clientName: string }) {
  const isClient = message.direction === "inbound";
  const isAi = message.author === "ai";
  const failed = message.deliveryError !== null;
  return (
    <div className={cn("flex", isClient ? "justify-start" : "justify-end")}>
      <div className={cn("flex max-w-[80%] flex-col gap-1", isClient ? "items-start" : "items-end")}>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isAi ? <Sparkles className="size-3" /> : null}
          <span>{authorLabel(message, clientName)}</span>
          <span>·</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        {/* Plain text only: client and AI text is never rendered as HTML. */}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
            isClient && "rounded-tl-sm bg-muted",
            !isClient && !isAi && "rounded-tr-sm bg-primary text-primary-foreground",
            isAi && "rounded-tr-sm border border-violet-200 bg-violet-50 text-violet-950",
            failed && "border border-destructive/50 bg-destructive/5 text-foreground",
          )}
        >
          {message.text}
        </div>
        {failed ? (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <CircleAlert className="size-3.5" />
            Не доставлено: {labelFor(DELIVERY_ERROR_LABELS, message.deliveryError)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Rendered from props on every refresh — no client copy of the messages that could go stale. */
export function ConversationThread({
  messages,
  clientName,
  hiddenCount = 0,
}: {
  messages: LeadMessageView[];
  clientName: string;
  /** Earlier messages that were not loaded (the card shows only the latest ones). */
  hiddenCount?: number;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Переписки пока нет. Сообщения клиента из Telegram и ответы менеджера появятся здесь.
      </div>
    );
  }

  const days = messages.map((message) => toAppDateKey(message.createdAt));
  return (
    <ThreadAutoScroll messageCount={messages.length}>
      <div className="flex flex-col gap-3">
        {hiddenCount > 0 ? (
          <div className="text-center text-xs text-muted-foreground">
            Показаны последние {messages.length} сообщений, ещё {hiddenCount} раньше — они остались в Telegram.
          </div>
        ) : null}
        {messages.map((message, index) => {
          const showDay = index === 0 || days[index] !== days[index - 1];
          return (
            <div key={message.id} className="flex flex-col gap-3">
              {showDay ? (
                <div className="flex justify-center">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {dayFormatter.format(message.createdAt)}
                  </span>
                </div>
              ) : null}
              {message.direction === "internal" ? (
                <SystemNote message={message} />
              ) : (
                <Bubble message={message} clientName={clientName} />
              )}
            </div>
          );
        })}
      </div>
    </ThreadAutoScroll>
  );
}
