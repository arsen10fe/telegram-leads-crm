/** What the server answered to "has anything changed?". */
export type StampResult = { kind: "stamp"; stamp: string } | { kind: "signed_out" } | { kind: "unavailable" };

export type LiveRefreshTick = "hidden" | "busy" | "stale" | "changed" | "unchanged" | "signed_out" | "unavailable";

export type LiveRefreshOptions = {
  /** The stamp the page was rendered with. */
  stamp: string;
  /** Refresh in full at least this often, for time-based state (the 24-hour reply window). */
  maxStaleMs: number;
  /** Must not hang forever: give it a timeout. */
  fetchStamp: () => Promise<StampResult>;
  refresh: () => void;
  isVisible: () => boolean;
  now?: () => number;
};

/**
 * Decides when a live CRM page re-renders. Each tick asks the server for a tiny change stamp and
 * refreshes only when it differs from the stamp the page was rendered with. Nothing overlaps: on
 * a slow link, refreshes that pile up in the router queue delay the manager's own actions.
 */
export function createLiveRefresh(options: LiveRefreshOptions) {
  const now = options.now ?? Date.now;
  let renderedStamp = options.stamp;
  let isRefreshing = false;
  let isChecking = false;
  let lastRefreshAt = now();

  function refresh(): void {
    lastRefreshAt = now();
    options.refresh();
  }

  async function check(): Promise<LiveRefreshTick> {
    let result: StampResult;
    try {
      result = await options.fetchStamp();
    } catch {
      return "unavailable";
    }
    if (result.kind === "unavailable") return "unavailable";
    if (result.kind === "signed_out") {
      // The page itself redirects to the login form.
      refresh();
      return "signed_out";
    }
    if (result.stamp === renderedStamp) return "unchanged";
    refresh();
    return "changed";
  }

  return {
    /** The page rendered (again) with this stamp. */
    rendered(stamp: string): void {
      renderedStamp = stamp;
    },

    /** Mirrors the pending state of the refresh transition. */
    setRefreshing(value: boolean): void {
      isRefreshing = value;
    },

    async tick(): Promise<LiveRefreshTick> {
      if (!options.isVisible()) return "hidden";
      if (isRefreshing || isChecking) return "busy";
      if (now() - lastRefreshAt >= options.maxStaleMs) {
        refresh();
        return "stale";
      }
      isChecking = true;
      try {
        return await check();
      } finally {
        isChecking = false;
      }
    },
  };
}
