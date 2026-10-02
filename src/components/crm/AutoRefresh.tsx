"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLiveRefresh, type StampResult } from "@/lib/live-refresh";

const CHECK_TIMEOUT_MS = 10_000;

async function fetchStamp(): Promise<StampResult> {
  try {
    const response = await fetch("/api/changes", { cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    // proxy.ts redirects a signed-out request to the login page.
    if (response.status === 401 || response.redirected) return { kind: "signed_out" };
    if (!response.ok) return { kind: "unavailable" };
    const body: unknown = await response.json();
    const stamp = typeof body === "object" && body !== null && "stamp" in body ? body.stamp : null;
    return typeof stamp === "string" ? { kind: "stamp", stamp } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * Live updates without WebSockets: every few seconds the page asks /api/changes whether anything
 * changed and re-renders its Server Components only then (and once a minute regardless). Client
 * state (open dialogs, typed text) is preserved.
 */
export function AutoRefresh({
  stamp,
  intervalMs = 4_000,
  maxStaleMs = 60_000,
}: {
  /** From readChangeStamp(), read before the page data. */
  stamp: string;
  intervalMs?: number;
  maxStaleMs?: number;
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [live] = useState(() =>
    createLiveRefresh({
      stamp,
      maxStaleMs,
      fetchStamp,
      refresh: () => startTransition(() => router.refresh()),
      isVisible: () => document.visibilityState === "visible",
    }),
  );

  useEffect(() => live.rendered(stamp), [live, stamp]);
  useEffect(() => live.setRefreshing(isRefreshing), [live, isRefreshing]);

  useEffect(() => {
    const tick = () => void live.tick();
    // The page may come from the router cache (staleTimes.dynamic): check right away, not in 4 s.
    tick();
    const timer = setInterval(tick, intervalMs);
    // Catch up as soon as the manager returns to the tab.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live, intervalMs]);

  return null;
}
