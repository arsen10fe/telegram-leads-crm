import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";
import { AutoRefresh } from "@/components/crm/AutoRefresh";
import {
  AiModeBadge,
  AiStatusBadge,
  AwaitingReplyBadge,
  NeedsHumanBadge,
  SourceBadge,
  TagBadge,
  TemperatureBadge,
} from "@/components/crm/badges";
import { ClickableRow } from "@/components/crm/ClickableRow";
import { EmptyState } from "@/components/crm/EmptyState";
import { PageHeader } from "@/components/crm/PageHeader";
import { RelativeTime } from "@/components/crm/RelativeTime";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countRu } from "@/lib/format";
import { leads, type LeadListItem, type LeadSourceValue } from "@/modules/leads";
import { getEnv } from "@/shared/env";
import { LeadFilters, type LeadFilterValues } from "./LeadFilters";
import { NewLeadDialog } from "./NewLeadDialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Лиды" };

const SOURCES: readonly LeadSourceValue[] = ["bot", "telegram_account", "manual"];
const MAX_TAGS_IN_ROW = 4;

function readFilters(params: Record<string, string | string[] | undefined>): LeadFilterValues {
  const tags = params.tag;
  const source = typeof params.source === "string" ? params.source : null;
  return {
    tagIds: (Array.isArray(tags) ? tags : tags ? [tags] : []).filter(Boolean).slice(0, 20),
    source: source && (SOURCES as readonly string[]).includes(source) ? source : null,
    needsHuman: params.needsHuman === "1",
    q: typeof params.q === "string" ? params.q.slice(0, 100) : "",
  };
}

function LeadRow({ lead }: { lead: LeadListItem }) {
  return (
    <ClickableRow href={`/leads/${lead.id}`}>
      <TableCell className="max-w-72 py-3">
        <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
          {lead.name}
        </Link>
        <div className="truncate text-xs text-muted-foreground">{lead.contact ?? "контакт не указан"}</div>
        {lead.qualification?.summary ? (
          <div className="mt-1 line-clamp-1 text-xs text-muted-foreground" title={lead.qualification.summary}>
            {lead.qualification.summary}
          </div>
        ) : null}
        {/* Phones: the columns below are hidden, so status, tags and activity go under the name. */}
        <div className="mt-2 flex flex-wrap items-center gap-1 sm:hidden">
          <StatusBadges lead={lead} />
          <LeadTags lead={lead} />
          <span className="text-xs text-muted-foreground">
            <RelativeTime date={lead.lastActivityAt} />
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <SourceBadge source={lead.source} />
      </TableCell>
      <TableCell className="hidden max-w-64 sm:table-cell">
        <div className="flex flex-wrap gap-1">
          <LeadTags lead={lead} />
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          <AiModeBadge mode={lead.aiMode} />
          {lead.qualification ? <TemperatureBadge temperature={lead.qualification.temperature} /> : null}
          <AiStatusBadge status={lead.aiStatus} />
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          <StatusBadges lead={lead} />
        </div>
      </TableCell>
      <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground md:table-cell">
        <RelativeTime date={lead.lastActivityAt} />
      </TableCell>
    </ClickableRow>
  );
}

function LeadTags({ lead }: { lead: LeadListItem }) {
  const extraTags = lead.tags.length - MAX_TAGS_IN_ROW;
  return (
    <>
      {lead.tags.slice(0, MAX_TAGS_IN_ROW).map((tag) => (
        <TagBadge key={tag.id} name={tag.name} color={tag.color} origin={tag.origin} confidence={tag.confidence} />
      ))}
      {extraTags > 0 ? <span className="text-xs text-muted-foreground">+{extraTags}</span> : null}
    </>
  );
}

function StatusBadges({ lead }: { lead: LeadListItem }) {
  return (
    <>
      {lead.needsHuman ? <NeedsHumanBadge /> : null}
      {lead.awaitingReply && !lead.needsHuman ? <AwaitingReplyBadge /> : null}
    </>
  );
}

function headerDescription(shown: number, total: number): string | undefined {
  if (shown === 0) return undefined;
  if (total > shown) return `Показаны ${shown} из ${countRu(total, ["лида", "лидов", "лидов"])} с последним движением — уточните поиск или фильтры`;
  return `${countRu(shown, ["лид", "лида", "лидов"])} · сначала те, где было последнее движение`;
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const requested = readFilters(await searchParams);
  const tags = await leads.listTags();
  // A bookmarked filter can point at a deleted tag: drop it instead of showing an unexplained empty list.
  const filters = { ...requested, tagIds: requested.tagIds.filter((id) => tags.some((tag) => tag.id === id)) };
  const listFilters = {
    tagIds: filters.tagIds,
    source: (filters.source as LeadSourceValue | null) ?? undefined,
    needsHuman: filters.needsHuman ? true : undefined,
    q: filters.q,
  };
  const [items, total] = await Promise.all([leads.listLeads(listFilters), leads.countLeads(listFilters)]);
  const botUsername = getEnv().TELEGRAM_BOT_USERNAME;
  const hasFilters = filters.tagIds.length > 0 || filters.source !== null || filters.needsHuman || filters.q !== "";

  return (
    <>
      <AutoRefresh />
      <PageHeader title="Лиды" description={headerDescription(items.length, total)} actions={<NewLeadDialog tags={tags} />} />
      <LeadFilters tags={tags} filters={filters} />

      <div className="rounded-lg border bg-background">
        {items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<SearchX />}
              title="Ничего не найдено"
              description="Попробуйте убрать часть фильтров."
              action={
                <Button variant="outline" asChild>
                  <Link href="/leads">Сбросить фильтры</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="Лидов пока нет"
              description={
                botUsername ? (
                  <>
                    Напишите боту{" "}
                    <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="font-medium underline">
                      @{botUsername}
                    </a>{" "}
                    — заявка появится здесь через пару секунд. Или создайте лида вручную.
                  </>
                ) : (
                  "Заявки из Telegram появятся здесь сами. Или создайте лида вручную."
                )
              }
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Лид</TableHead>
                <TableHead className="hidden md:table-cell">Источник</TableHead>
                <TableHead className="hidden sm:table-cell">Теги</TableHead>
                <TableHead className="hidden lg:table-cell">AI</TableHead>
                <TableHead className="hidden sm:table-cell">Статус</TableHead>
                <TableHead className="hidden text-right md:table-cell">Активность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((lead) => (
                <LeadRow key={lead.id} lead={lead} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
