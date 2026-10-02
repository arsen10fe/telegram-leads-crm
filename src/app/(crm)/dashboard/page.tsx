import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { readChangeStamp } from "@/app/_lib/change-stamp";
import { AutoRefresh } from "@/components/crm/AutoRefresh";
import { PageHeader } from "@/components/crm/PageHeader";
import { tagColorClasses } from "@/components/crm/tag-colors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countRu } from "@/lib/format";
import { HANDOFF_REASON_LABELS, labelFor, SOURCE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { dashboard, LEAD_SOURCES, type DashboardStats } from "@/modules/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Дашборд" };

const SOURCE_COLORS: Record<string, string> = {
  bot: "bg-sky-500",
  telegram_account: "bg-violet-500",
  manual: "bg-amber-500",
};

const LEAD_FORMS = ["лид", "лида", "лидов"] as const;

function StatCard({ label, value, hint, href }: { label: string; value: number; hint?: string; href?: string }) {
  const content = (
    <Card className="h-full gap-1 py-4 transition-colors hover:bg-muted/30">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function BarRow({ label, value, max, color, href }: { label: ReactNode; value: number; max: number; color: string; href?: string }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  const row = (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 truncate">{label}</span>
      <div className="h-2.5 flex-1 rounded-full bg-muted">
        <div className={cn("h-2.5 rounded-full", color)} style={{ width: `${width}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="rounded-sm hover:bg-muted/40">
      {row}
    </Link>
  ) : (
    row
  );
}

function LeadsPerDay({ stats }: { stats: DashboardStats }) {
  const max = Math.max(1, ...stats.perDay.map((day) => day.total));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-40 items-end gap-1.5">
        {stats.perDay.map((day) => (
          <div key={day.date} className="flex h-full flex-1 flex-col justify-end" title={`${day.date}: ${countRu(day.total, LEAD_FORMS)}`}>
            <div className="flex flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: `${(day.total / max) * 100}%` }}>
              {LEAD_SOURCES.map((source) =>
                day.byKey[source] > 0 ? (
                  <div key={source} className={SOURCE_COLORS[source]} style={{ flexGrow: day.byKey[source] }} />
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 text-[10px] text-muted-foreground">
        {stats.perDay.map((day) => (
          <span key={day.date} className="flex-1 text-center tabular-nums">
            {Number(day.date.slice(8))}.{Number(day.date.slice(5, 7))}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {LEAD_SOURCES.map((source) => (
          <span key={source} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", SOURCE_COLORS[source])} />
            {labelFor(SOURCE_LABELS, source)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const stamp = await readChangeStamp();
  const stats = await dashboard.getStats();
  const maxSource = Math.max(0, ...Object.values(stats.bySource));
  const maxTag = Math.max(0, ...stats.topTags.map((tag) => tag.count));
  const maxHandoff = Math.max(0, ...stats.ai.handoffs.map((handoff) => handoff.count));
  const qualifiedShare = stats.totalLeads > 0 ? Math.round((stats.ai.qualified / stats.totalLeads) * 100) : 0;

  return (
    <>
      <AutoRefresh stamp={stamp} intervalMs={15_000} />
      <PageHeader title="Дашборд" description="Лиды и работа AI. Дни считаются по московскому времени." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Всего лидов" value={stats.totalLeads} href="/leads" />
        <StatCard label="За 7 дней" value={stats.leadsLast7Days} />
        <StatCard label="Ждут ответа" value={stats.awaitingReply} hint="клиент написал последним" href="/leads" />
        <StatCard label="Нужен менеджер" value={stats.needsHuman} hint="AI передал диалог" href="/leads?needsHuman=1" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Новые лиды за 14 дней</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsPerDay stats={stats} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Источники</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {LEAD_SOURCES.map((source) => (
              <BarRow
                key={source}
                label={labelFor(SOURCE_LABELS, source)}
                value={stats.bySource[source]}
                max={maxSource}
                color={SOURCE_COLORS[source] ?? "bg-primary"}
                href={`/leads?source=${source}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Популярные теги</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {stats.topTags.length === 0 ? <p className="text-sm text-muted-foreground">Тегов на лидах пока нет.</p> : null}
            {stats.topTags.map((tag) => (
              <BarRow
                key={tag.id}
                label={tag.name}
                value={tag.count}
                max={maxTag}
                color={tagColorClasses(tag.color).dot}
                href={`/leads?tag=${tag.id}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">AI</CardTitle>
            <CardDescription>Что AI сделал сам и когда позвал человека.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Квалифицировано"
                value={stats.ai.qualified}
                hint={`${qualifiedShare}% лидов${stats.ai.failed > 0 ? ` · ошибок ${stats.ai.failed}` : ""}`}
              />
              <StatCard label="Ответов автопилота" value={stats.ai.autopilotReplies} />
              <StatCard label="Черновиков отправлено" value={stats.ai.draftsSent} hint="копилот" />
              <StatCard
                label="Передач менеджеру"
                value={stats.ai.handoffs.reduce((sum, handoff) => sum + handoff.count, 0)}
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-medium">Почему AI передал диалог</span>
              {stats.ai.handoffs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Передач ещё не было.</p>
              ) : (
                stats.ai.handoffs.map((handoff) => (
                  <BarRow
                    key={handoff.reason}
                    label={labelFor(HANDOFF_REASON_LABELS, handoff.reason)}
                    value={handoff.count}
                    max={maxHandoff}
                    color="bg-red-400"
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
