/**
 * Fixed-window in-memory limiter (per web process). Enough to stop password guessing and abuse of
 * expensive actions on the demo; a multi-instance deployment would need a shared store.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  const maxKeys = options.maxKeys ?? 10_000;

  // Bounded memory: drop expired keys, then the oldest ones if there are still too many
  // (e.g. a flood of distinct keys).
  function prune(now: number): void {
    for (const [key, times] of hits) {
      if (times.every((at) => now - at >= options.windowMs)) hits.delete(key);
    }
    for (const key of hits.keys()) {
      if (hits.size < maxKeys) break;
      hits.delete(key);
    }
  }

  return {
    /** Records an attempt; false when the key is over the limit. */
    take(key: string, now: number = Date.now()): boolean {
      if (hits.size >= maxKeys) prune(now);
      const recent = (hits.get(key) ?? []).filter((at) => now - at < options.windowMs);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    size: () => hits.size,
  };
}
