import { db } from "./db";
import { createLogger, errorInfo } from "./logger";

const log = createLogger("db");

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 2_000;

export type WaitForDatabaseOptions = {
  /** One connectivity probe; rejects while the database is unreachable. */
  ping?: () => Promise<unknown>;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/** Prisma codes for "the database is not there right now", as opposed to a bad query. */
const UNAVAILABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
/** @prisma/adapter-pg error kinds for the same situation (meta.driverAdapterError.cause.kind). */
const UNAVAILABLE_ADAPTER_KINDS = new Set(["DatabaseNotReachable", "ConnectionClosed", "SocketTimeout", "TooManyConnections"]);
/** SQLSTATE: class 08 (connection exception), 57P01-57P03 (shutdown, crash shutdown, starting up). */
const UNAVAILABLE_SQLSTATE = /^(08\w{3}|57P0[123])$/;
const UNAVAILABLE_MESSAGE =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|Can't reach database server|Connection terminated|server closed the connection|the database system is (starting up|shutting down)|terminating connection due to administrator command/i;

type ErrorLike = { code?: unknown; message?: unknown; cause?: unknown; meta?: { driverAdapterError?: { cause?: unknown } } };

/**
 * True when an error means the database is unreachable (restart, network blip, pool exhaustion),
 * so retrying later can succeed. A bad query, a constraint violation or a bug in our code is false.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && typeof current === "object" && depth < 5; depth += 1) {
    const candidate = current as ErrorLike;
    // Prisma codes (P1001…) and Node network codes (ECONNREFUSED…) both live in `code`.
    if (typeof candidate.code === "string" && (UNAVAILABLE_PRISMA_CODES.has(candidate.code) || UNAVAILABLE_MESSAGE.test(candidate.code))) {
      return true;
    }
    const adapterCause = candidate.meta?.driverAdapterError?.cause as { kind?: unknown; code?: unknown } | undefined;
    if (adapterCause && typeof adapterCause.kind === "string" && UNAVAILABLE_ADAPTER_KINDS.has(adapterCause.kind)) return true;
    if (adapterCause && typeof adapterCause.code === "string" && UNAVAILABLE_SQLSTATE.test(adapterCause.code)) return true;
    if (typeof candidate.message === "string" && UNAVAILABLE_MESSAGE.test(candidate.message)) return true;
    current = candidate.cause;
  }
  return false;
}

const defaultPing = () => db.$queryRaw`SELECT 1`;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves once the database answers. After a host reboot Docker restarts containers without
 * compose's depends_on, so the bot can start before Postgres: consuming Telegram's backlog then
 * would fail every insert and lose those leads. Throws after `timeoutMs`; the caller exits and
 * Docker's restart policy starts it again.
 */
export async function waitForDatabase(options: WaitForDatabaseOptions = {}): Promise<void> {
  const {
    ping = defaultPing,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const startedAt = now();

  for (let attempt = 1; ; attempt += 1) {
    try {
      await ping();
      log.info({ attempts: attempt, elapsedMs: now() - startedAt }, "database ready");
      return;
    } catch (error) {
      const elapsedMs = now() - startedAt;
      log.warn({ attempt, elapsedMs, ...errorInfo(error) }, "database not reachable yet");
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0) {
        log.error({ attempts: attempt, timeoutMs }, "database still unreachable: giving up");
        throw new Error(`Database unreachable after ${attempt} attempts in ${timeoutMs} ms`);
      }
      // The last wait ends exactly at the deadline, so one final attempt happens there.
      await sleep(Math.min(intervalMs, remainingMs));
    }
  }
}
