import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getEnv } from "./env";
import { createLogger } from "./logger";

const log = createLogger("db");

const SLOW_QUERY_MS = 500;

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: getEnv().DATABASE_URL,
    // @prisma/adapter-pg writes DateTime values as UTC wall-clock time without an offset and
    // drops the offset when reading timestamptz, so the session must run in UTC. Otherwise a
    // server in Europe/Moscow shifts every stored time by 3 hours (verified in the adapter source).
    options: "-c TimeZone=UTC",
  });
  const client = new PrismaClient({
    adapter,
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });

  client.$on("query", (event) => {
    if (event.duration >= SLOW_QUERY_MS) {
      log.warn({ durationMs: event.duration }, "slow query");
      return;
    }
    // Query text only at trace: it may contain identifiers but never parameter values.
    if (log.isLevelEnabled("trace")) log.trace({ durationMs: event.duration, query: event.query }, "query");
  });
  client.$on("warn", (event) => log.warn({ target: event.target }, event.message));
  client.$on("error", (event) => log.error({ target: event.target }, event.message));

  log.debug("prisma client created");
  return client;
}

export type DbClient = ReturnType<typeof createPrismaClient>;
export type Tx = Prisma.TransactionClient;
/** What repositories accept: the root client or the client of an interactive transaction. */
export type Db = DbClient | Tx;

// Next.js dev re-evaluates modules on change: reuse one client to avoid connection storms.
const globalForDb = globalThis as unknown as { lidogramDb?: DbClient };
let client: DbClient | undefined;

function getClient(): DbClient {
  if (client) return client;
  client = globalForDb.lidogramDb ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForDb.lidogramDb = client;
  return client;
}

/**
 * The single Prisma client. Created on first use, so importing this module never needs
 * DATABASE_URL (e.g. during `next build`).
 */
export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, property) {
    const target = getClient();
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export async function disconnectDb(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = undefined;
  globalForDb.lidogramDb = undefined;
  log.debug("prisma client disconnected");
}
