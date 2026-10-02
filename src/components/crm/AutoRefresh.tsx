"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Live updates without WebSockets: re-renders the Server Components of the current page every few
 * seconds while the tab is visible. Client state (open dialogs, typed text) is preserved.
 */
export function AutoRefresh({ intervalMs = 4_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, intervalMs);
    // Catch up immediately when the manager returns to the tab.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
