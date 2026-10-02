"use client";

import { useSyncExternalStore } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";
import { formatFullDateTime } from "@/lib/format";

// One shared clock for every RelativeTime on the page, ticking every 30 s.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  now = Date.now();
  timer ??= setInterval(() => {
    now = Date.now();
    listeners.forEach((notify) => notify());
  }, 30_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now;
// The server renders no relative text, so server and client HTML never disagree during hydration.
const getServerSnapshot = () => null;

export function RelativeTime({ date, className }: { date: Date | string; className?: string }) {
  const clock = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = date instanceof Date ? date : new Date(date);
  const absolute = formatFullDateTime(value);

  let text = "…";
  if (clock !== null) {
    text =
      Math.abs(clock - value.getTime()) < 45_000
        ? "только что"
        : formatDistanceToNowStrict(value, { addSuffix: true, locale: ru });
  }

  return (
    <time dateTime={value.toISOString()} title={absolute} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
