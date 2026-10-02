import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AutoRefresh } from "@/components/crm/AutoRefresh";
import { AiModeBadge, AwaitingReplyBadge, NeedsHumanBadge, SourceBadge } from "@/components/crm/badges";
import { ConversationThread } from "@/components/crm/ConversationThread";
import { CopyButton } from "@/components/crm/CopyButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countRu, formatDateTime, formatFullDateTime } from "@/lib/format";
import { ai } from "@/modules/ai";
import { channels, type ReplyAvailability } from "@/modules/channels";
import { leads, type LeadDetails } from "@/modules/leads";
import { AiModeSwitcher } from "./AiModeSwitcher";
import { AiPanel } from "./AiPanel";
import { EditLeadDialog } from "./EditLeadDialog";
import { LeadTagsEditor } from "./LeadTagsEditor";
import { NeedsHumanBanner } from "./NeedsHumanBanner";
import { ReplyComposer } from "./ReplyComposer";

export const dynamic = "force-dynamic";

// One query per render: metadata and the page share it (the page refreshes every few seconds).
const getLead = cache((id: string) => leads.getLeadDetails(id));

export async function generateMetadata({ params }: PageProps<"/leads/[id]">): Promise<Metadata> {
  const { id } = await params;
  const lead = await getLead(id);
  return { title: lead?.name ?? "Лид" };
}

function composerState(lead: LeadDetails, availability: ReplyAvailability): { disabledReason?: string; hint?: string } {
  if (availability.canReply) {
    if (availability.channel === "bot") return { hint: "Ответ уйдёт в чат с ботом · Ctrl/⌘ + Enter" };
    const until = availability.closesAt ? ` до ${formatDateTime(availability.closesAt)}` : "";
    return { hint: `Ответ уйдёт от имени подключённого аккаунта${until} · Ctrl/⌘ + Enter` };
  }
  if (availability.reason === "business_window_closed") {
    return {
      disabledReason:
        "Прошло больше 24 часов с последнего сообщения клиента — Telegram не даёт ответить от имени аккаунта. Напишите клиенту из Telegram сами.",
    };
  }
  if (availability.reason === "business_disconnected") {
    return { disabledReason: "Telegram Business отключён или у бота нет права отвечать. Проверьте подключение в настройках." };
  }
  return {
    disabledReason:
      lead.source === "manual"
        ? "Лид добавлен вручную: у него нет чата в Telegram. Свяжитесь с клиентом по контакту из карточки."
        : "У лида нет чата в Telegram (демо-данные).",
  };
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const [lead, allTags, availability, drafts] = await Promise.all([
    getLead(id),
    leads.listTags(),
    channels.getReplyAvailability(id),
    leads.getDraftState(id),
  ]);
  if (!lead) notFound();
  const composer = composerState(lead, availability);
  const copilot = { enabled: ai.isEnabled(), draft: drafts.pending, staleDraft: drafts.latestSuperseded };

  return (
    <>
      <AutoRefresh />
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Все лиды
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1>
          <div className="flex flex-wrap gap-1.5">
            <SourceBadge source={lead.source} />
            <AiModeBadge mode={lead.aiMode} />
            {lead.needsHuman ? <NeedsHumanBadge /> : null}
            {lead.awaitingReply && !lead.needsHuman ? <AwaitingReplyBadge /> : null}
          </div>
        </div>
        <EditLeadDialog leadId={lead.id} name={lead.name} contact={lead.contact} request={lead.request} />
      </div>

      {lead.needsHuman ? <NeedsHumanBanner leadId={lead.id} reason={lead.handoffReason} /> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">Переписка</CardTitle>
          </CardHeader>
          <ConversationThread messages={lead.messages} clientName={lead.name} />
          {/* Stable key: the typed text survives the auto-refresh and a superseded draft */}
          <ReplyComposer
            key={lead.id}
            leadId={lead.id}
            disabledReason={composer.disabledReason}
            hint={composer.hint}
            copilot={copilot}
          />
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Контакты</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <InfoRow label="Контакт">
                {lead.contact ? (
                  <span className="flex items-center gap-1">
                    <span className="break-all">{lead.contact}</span>
                    <CopyButton value={lead.contact} label="Скопировать контакт" />
                  </span>
                ) : (
                  <span className="text-muted-foreground">не указан</span>
                )}
              </InfoRow>
              {lead.telegramLink ? (
                <InfoRow label="Telegram">
                  <a href={lead.telegramLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                    {lead.telegramUsername ? `@${lead.telegramUsername}` : "Открыть чат"}
                    <ExternalLink className="size-3.5" />
                  </a>
                </InfoRow>
              ) : null}
              {lead.request ? (
                <InfoRow label="Запрос">
                  <p className="whitespace-pre-wrap">{lead.request}</p>
                </InfoRow>
              ) : null}
              <InfoRow label="Создан">{formatFullDateTime(lead.createdAt)}</InfoRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Теги</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadTagsEditor leadId={lead.id} assigned={lead.tags} allTags={allTags} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <AiPanel lead={lead} allTags={allTags} />
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase">Режим ответа</span>
                <AiModeSwitcher leadId={lead.id} mode={lead.aiMode} hasChannel={lead.channel !== null} />
                {lead.aiRepliesLast24h > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Автопилот ответил {countRu(lead.aiRepliesLast24h, ["раз", "раза", "раз"])} за 24 ч
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
