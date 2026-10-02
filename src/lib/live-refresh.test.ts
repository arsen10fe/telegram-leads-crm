// Regression tests for PERF-01 (2026-10-02): an idle CRM page re-rendered itself every 4 s and
// re-prefetched every menu link (25 requests / 79 KB per 20 s per tab). On a slow link those
// refreshes piled up in the router queue in front of the manager's own actions.
import { describe, expect, it, vi } from "vitest";
import { createLiveRefresh, type StampResult } from "./live-refresh";

function setup(options: { stamp?: string; maxStaleMs?: number } = {}) {
  let clock = 0;
  let visible = true;
  const fetchStamp = vi.fn<() => Promise<StampResult>>(async () => ({ kind: "stamp", stamp: "s1" }));
  const refresh = vi.fn();
  const live = createLiveRefresh({
    stamp: options.stamp ?? "s1",
    maxStaleMs: options.maxStaleMs ?? 60_000,
    fetchStamp,
    refresh,
    isVisible: () => visible,
    now: () => clock,
  });
  return {
    live,
    fetchStamp,
    refresh,
    advance: (ms: number) => (clock += ms),
    hide: () => (visible = false),
  };
}

describe("live refresh", () => {
  it("does not re-render an idle page: the data did not change", async () => {
    const { live, refresh, fetchStamp, advance } = setup();

    for (let tick = 0; tick < 5; tick++) {
      advance(4_000);
      expect(await live.tick()).toBe("unchanged");
    }

    expect(fetchStamp).toHaveBeenCalledTimes(5);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("re-renders once when the server reports a new stamp", async () => {
    const { live, refresh, fetchStamp, advance } = setup();
    fetchStamp.mockResolvedValue({ kind: "stamp", stamp: "s2" });

    advance(4_000);
    expect(await live.tick()).toBe("changed");
    expect(refresh).toHaveBeenCalledTimes(1);

    // The refreshed page rendered with the new stamp: nothing more to do.
    live.rendered("s2");
    advance(4_000);
    expect(await live.tick()).toBe("unchanged");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never starts a second check while one is still in flight (slow network)", async () => {
    const { live, fetchStamp } = setup();
    let answer: (result: StampResult) => void = () => {};
    fetchStamp.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    const first = live.tick();
    expect(await live.tick()).toBe("busy");
    expect(fetchStamp).toHaveBeenCalledTimes(1);

    answer({ kind: "stamp", stamp: "s1" });
    expect(await first).toBe("unchanged");
  });

  it("does not check or refresh while a refresh is still rendering", async () => {
    const { live, refresh, fetchStamp } = setup({ maxStaleMs: 0 });

    live.setRefreshing(true);
    expect(await live.tick()).toBe("busy");
    expect(fetchStamp).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("still refreshes in full once a minute, for time-based state", async () => {
    const { live, refresh, fetchStamp, advance } = setup();

    advance(60_000);
    expect(await live.tick()).toBe("stale");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchStamp).not.toHaveBeenCalled();

    advance(4_000);
    expect(await live.tick()).toBe("unchanged");
  });

  it("does nothing in a hidden tab", async () => {
    const { live, refresh, fetchStamp, advance, hide } = setup();
    hide();
    advance(120_000);

    expect(await live.tick()).toBe("hidden");
    expect(fetchStamp).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the session ended, so the page redirects to the login form", async () => {
    const { live, refresh, fetchStamp } = setup();
    fetchStamp.mockResolvedValue({ kind: "signed_out" });

    expect(await live.tick()).toBe("signed_out");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("survives a failed check and tries again on the next tick", async () => {
    const { live, refresh, fetchStamp } = setup();
    fetchStamp.mockRejectedValueOnce(new Error("network down"));
    fetchStamp.mockResolvedValueOnce({ kind: "unavailable" });
    fetchStamp.mockResolvedValueOnce({ kind: "stamp", stamp: "s2" });

    expect(await live.tick()).toBe("unavailable");
    expect(await live.tick()).toBe("unavailable");
    expect(await live.tick()).toBe("changed");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
