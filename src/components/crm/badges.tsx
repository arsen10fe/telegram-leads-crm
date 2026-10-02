import { Bot, Hand, LoaderCircle, MessageCircleQuestion, PenLine, Send, Sparkles, TriangleAlert, User, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { AI_MODE_LABELS, labelFor, SOURCE_LABELS, TEMPERATURE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { tagColorClasses } from "./tag-colors";

const SOURCE_ICONS: Record<string, ReactNode> = {
  bot: <Bot />,
  telegram_account: <Send />,
  manual: <PenLine />,
};

export function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      {SOURCE_ICONS[source] ?? <User />}
      {labelFor(SOURCE_LABELS, source)}
    </Badge>
  );
}

export function TagBadge({
  name,
  color,
  origin,
  confidence,
  onRemove,
  className,
}: {
  name: string;
  color: string;
  origin?: string;
  confidence?: number | null;
  onRemove?: () => void;
  className?: string;
}) {
  const isAi = origin === "ai";
  const title = isAi
    ? `Поставил AI${confidence != null ? ` (уверенность ${Math.round(confidence * 100)}%)` : ""}`
    : undefined;
  return (
    <Badge variant="outline" title={title} className={cn("gap-1 font-normal", tagColorClasses(color).badge, className)}>
      {isAi ? <Sparkles aria-label="AI" /> : null}
      {name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать тег ${name}`}
          className="-mr-1 rounded-sm opacity-60 transition hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </Badge>
  );
}

const AI_MODE_STYLES: Record<string, string> = {
  autopilot: "border-violet-200 bg-violet-50 text-violet-700",
  copilot: "border-sky-200 bg-sky-50 text-sky-700",
  off: "text-muted-foreground",
};

export function AiModeBadge({ mode }: { mode: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", AI_MODE_STYLES[mode])}>
      {mode === "off" ? null : <Sparkles />}
      {labelFor(AI_MODE_LABELS, mode)}
    </Badge>
  );
}

export function NeedsHumanBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
      <Hand />
      Нужен менеджер
    </Badge>
  );
}

export function AwaitingReplyBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
      <MessageCircleQuestion />
      Ждёт ответа
    </Badge>
  );
}

const TEMPERATURE_STYLES: Record<string, string> = {
  hot: "border-red-200 bg-red-50 text-red-700",
  warm: "border-amber-200 bg-amber-50 text-amber-800",
  cold: "border-slate-200 bg-slate-50 text-slate-600",
};

const TEMPERATURE_ICONS: Record<string, string> = { hot: "🔥", warm: "☀️", cold: "❄️" };

export function TemperatureBadge({ temperature }: { temperature: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", TEMPERATURE_STYLES[temperature])}>
      <span aria-hidden>{TEMPERATURE_ICONS[temperature]}</span>
      {labelFor(TEMPERATURE_LABELS, temperature)}
    </Badge>
  );
}

/** Pending, failed or disabled AI — the lead itself is always fine. */
export function AiStatusBadge({ status }: { status: string | null }) {
  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
        <LoaderCircle className="animate-spin" />
        AI анализирует
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground" title="Лид сохранён, AI-анализ не удался">
        <TriangleAlert />
        AI недоступен
      </Badge>
    );
  }
  if (status === "disabled") {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        AI выключен
      </Badge>
    );
  }
  return null;
}
