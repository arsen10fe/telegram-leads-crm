import { createLogger } from "@/shared/logger";
import { addDays, startOfAppDay } from "@/shared/time";
import { bucketByAppDay, type DayBucket } from "../models/day-buckets";
import { dashboardRepository } from "../repositories/dashboard-repository";

const log = createLogger("dashboard");

export const LEAD_SOURCES = ["bot", "telegram_account", "manual"] as const;
export type DashboardSource = (typeof LEAD_SOURCES)[number];

const DAYS = 14;
const TOP_TAGS = 8;

export type DashboardStats = {
  totalLeads: number;
  leadsLast7Days: number;
  awaitingReply: number;
  needsHuman: number;
  perDay: DayBucket<DashboardSource>[];
  bySource: Record<DashboardSource, number>;
  topTags: Array<{ id: string; name: string; color: string; count: number }>;
  ai: {
    qualified: number;
    failed: number;
    disabled: number;
    autopilotReplies: number;
    handoffs: Array<{ reason: string; count: number }>;
    draftsSent: number;
  };
};

async function timed<T>(query: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const result = await run();
  log.debug({ query, ms: Date.now() - startedAt }, "dashboard query");
  return result;
}

export async function getDashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const windowStart = addDays(startOfAppDay(now), -(DAYS - 1));
  const [recent, bySourceRows, byAiStatus, needsHuman, awaitingReply, topTags, autopilotReplies, handoffs, draftsSent] =
    await Promise.all([
      timed("leadsCreatedSince", () => dashboardRepository.leadsCreatedSince(windowStart)),
      timed("countBySource", () => dashboardRepository.countBySource()),
      timed("countByAiStatus", () => dashboardRepository.countByAiStatus()),
      timed("countNeedsHuman", () => dashboardRepository.countNeedsHuman()),
      timed("countAwaitingReply", () => dashboardRepository.countAwaitingReply()),
      timed("topTags", () => dashboardRepository.topTags(TOP_TAGS)),
      timed("countAutopilotReplies", () => dashboardRepository.countAutopilotReplies()),
      timed("handoffsByReason", () => dashboardRepository.handoffsByReason()),
      timed("countDraftsSent", () => dashboardRepository.countDraftsSent()),
    ]);

  const perDay = bucketByAppDay(
    recent.map((lead) => ({ at: lead.createdAt, key: lead.source })),
    LEAD_SOURCES,
    DAYS,
    now,
  );
  const bySource = Object.fromEntries(LEAD_SOURCES.map((source) => [source, 0])) as Record<DashboardSource, number>;
  for (const row of bySourceRows) bySource[row.source] = row._count._all;
  const aiCount = (status: string) => byAiStatus.find((row) => row.aiStatus === status)?._count._all ?? 0;

  return {
    totalLeads: Object.values(bySource).reduce((sum, count) => sum + count, 0),
    leadsLast7Days: perDay.slice(-7).reduce((sum, day) => sum + day.total, 0),
    awaitingReply,
    needsHuman,
    perDay,
    bySource,
    topTags,
    ai: {
      qualified: aiCount("ok"),
      failed: aiCount("failed"),
      disabled: aiCount("disabled"),
      autopilotReplies,
      handoffs,
      draftsSent,
    },
  };
}
