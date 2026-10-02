import { getDashboardStats } from "./services/dashboard-service";

/** Public API of the dashboard module (read-only aggregates). */
export const dashboard = {
  getStats: getDashboardStats,
};

export type { DayBucket } from "./models/day-buckets";
export { LEAD_SOURCES, type DashboardSource, type DashboardStats } from "./services/dashboard-service";
