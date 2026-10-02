import { CircleAlert } from "lucide-react";
import { AiStatusBadge, TemperatureBadge } from "@/components/crm/badges";
import { labelFor, SERVICE_LABELS, URGENCY_LABELS } from "@/lib/labels";
import type { LeadDetails, TagView } from "@/modules/leads";
import { AiTagHints } from "./AiTagHints";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function StatusNote({ status }: { status: LeadDetails["aiStatus"] }) {
  if (status === "disabled") {
    return <p className="text-sm text-muted-foreground">AI выключен в настройках сервера. Лиды и теги работают как обычно.</p>;
  }
  if (status === "failed") {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        AI-анализ не удался — лид сохранён, всё работает как обычно.
      </p>
    );
  }
  if (status === "pending") return <p className="text-sm text-muted-foreground">Анализ запроса займёт несколько секунд.</p>;
  return <p className="text-sm text-muted-foreground">Анализа ещё не было.</p>;
}

/** What the AI understood about the lead. A failed or disabled AI never hides the lead itself. */
export function AiPanel({ lead, allTags }: { lead: LeadDetails; allTags: TagView[] }) {
  const qualification = lead.qualification;

  if (!qualification) {
    return (
      <div className="flex flex-col gap-2">
        <AiStatusBadge status={lead.aiStatus} />
        <StatusNote status={lead.aiStatus} />
      </div>
    );
  }

  // Hints the manager can still use: existing tags, not assigned yet, not removed before.
  const assigned = new Set([...lead.tags.map((tag) => tag.id), ...lead.dismissedTagIds]);
  const hints = qualification.hints
    .filter((tagId) => !assigned.has(tagId))
    .flatMap((tagId) => allTags.filter((tag) => tag.id === tagId));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <TemperatureBadge temperature={qualification.temperature} />
        <AiStatusBadge status={lead.aiStatus === "ok" ? null : lead.aiStatus} />
      </div>
      {qualification.summary ? <p className="text-sm">{qualification.summary}</p> : null}
      <div className="flex flex-col gap-1.5">
        <Field label="Услуга" value={labelFor(SERVICE_LABELS, qualification.service)} />
        <Field label="Бюджет" value={qualification.budget ?? "не назван"} />
        <Field label="Срочность" value={labelFor(URGENCY_LABELS, qualification.urgency, "не ясна")} />
        <Field label="Уверенность AI" value={`${Math.round(qualification.confidence * 100)}%`} />
      </div>
      <AiTagHints leadId={lead.id} hints={hints} />
      {lead.aiStatus === "failed" ? <StatusNote status="failed" /> : null}
    </div>
  );
}
