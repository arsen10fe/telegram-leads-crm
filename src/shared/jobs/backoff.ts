const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Delay before the next try after failed attempt number `attempt` (1-based): 5 s, 10 s, 20 s… ≤ 5 min. */
export function backoffDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
}

export function nextRunAt(attempt: number, now: Date): Date {
  return new Date(now.getTime() + backoffDelayMs(attempt));
}

export function shouldGiveUp(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}
