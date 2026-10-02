"use client";

import { useEffect, useRef, type ReactNode } from "react";

const STICK_TO_BOTTOM_PX = 160;

/**
 * Scrolls the thread to the newest message on first render, and again when new messages arrive
 * while the manager is already near the bottom (reading old messages is never interrupted).
 */
export function ThreadAutoScroll({ messageCount, children }: { messageCount: number; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const wasNearBottom = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (isFirstRender.current || wasNearBottom.current) {
      container.scrollTop = container.scrollHeight;
    }
    isFirstRender.current = false;
  }, [messageCount]);

  return (
    <div
      ref={containerRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        wasNearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
      }}
      className="h-[min(60vh,640px)] overflow-y-auto px-4 py-4"
    >
      {children}
    </div>
  );
}
