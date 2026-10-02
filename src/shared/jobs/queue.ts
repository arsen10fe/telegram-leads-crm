import { db, type Db } from "../db";
import { createLogger } from "../logger";
import { nextRunAt, shouldGiveUp } from "./backoff";
import {
  JobPayloadSchemas,
  type ClaimedJob,
  type EnqueueOptions,
  type JobPayloads,
  type JobType,
} from "./types";

const log = createLogger("jobs.queue");

const DEFAULT_MAX_ATTEMPTS = 3;
/** Above the runner's 60 s job timeout: a job "running" longer than this has lost its worker. */
export const STALE_RUNNING_MS = 2 * 60_000;
const LAST_ERROR_MAX_LENGTH = 1_000;

/**
 * Writes a job inside the caller's transaction (transactional outbox): the job exists only if the
 * data that caused it was committed.
 */
export async function enqueue<K extends JobType>(
  tx: Db,
  type: K,
  payload: JobPayloads[K],
  options: EnqueueOptions = {},
): Promise<string> {
  const data = JobPayloadSchemas[type].parse(payload);
  const delayMs = options.delayMs ?? 0;
  const job = await tx.job.create({
    data: {
      type,
      payload: data,
      runAt: new Date(Date.now() + delayMs),
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    },
    select: { id: true },
  });
  log.debug({ jobId: job.id, type, delayMs }, "job enqueued");
  return job.id;
}

/**
 * Atomically takes the next due job. Concurrent workers never get the same job. Autopilot replies
 * go first: a client is waiting for them, unlike for qualification or notifications.
 */
export async function claimNext(): Promise<ClaimedJob | null> {
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "Job"
    SET status = 'running', attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'pending' AND "runAt" <= now()
      ORDER BY (type = 'autopilot_reply') DESC, "runAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, "maxAttempts"
  `;
  return rows[0] ?? null;
}

export async function complete(jobId: string): Promise<void> {
  await db.job.update({ where: { id: jobId }, data: { status: "done", lastError: null } });
}

export type FailOutcome = { outcome: "retry"; nextRunAt: Date } | { outcome: "gave_up" };

/** Schedules a retry with backoff, or marks the job failed once its attempts are used up. */
export async function fail(job: ClaimedJob, error: unknown, now: Date = new Date()): Promise<FailOutcome> {
  const lastError = describeError(error);
  if (shouldGiveUp(job.attempts, job.maxAttempts)) {
    await db.job.update({ where: { id: job.id }, data: { status: "failed", lastError } });
    return { outcome: "gave_up" };
  }
  const runAt = nextRunAt(job.attempts, now);
  await db.job.update({ where: { id: job.id }, data: { status: "pending", runAt, lastError } });
  return { outcome: "retry", nextRunAt: runAt };
}

/** For jobs that can never succeed (unknown type, invalid payload): no retries. */
export async function failPermanently(jobId: string, error: unknown): Promise<void> {
  await db.job.update({ where: { id: jobId }, data: { status: "failed", lastError: describeError(error) } });
}

export type StaleRecovery = { requeued: number; exhausted: ClaimedJob[] };

/**
 * Jobs left `running` by a crashed or killed worker. Those with attempts left go back to the queue;
 * those that used their last attempt are NOT re-run (an autopilot reply might already have reached
 * the client) — they fail and are returned for their final-failure handler (e.g. a handoff).
 */
export async function recoverStale(now: Date = new Date()): Promise<StaleRecovery> {
  const threshold = new Date(now.getTime() - STALE_RUNNING_MS);
  const exhausted = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "Job"
    SET status = 'failed', "lastError" = 'Worker stopped while the job was running', "updatedAt" = now()
    WHERE status = 'running' AND "updatedAt" < ${threshold} AND attempts >= "maxAttempts"
    RETURNING id, type, payload, attempts, "maxAttempts"
  `;
  const { count: requeued } = await db.job.updateMany({
    where: { status: "running", updatedAt: { lt: threshold } },
    data: { status: "pending" },
  });
  if (requeued > 0 || exhausted.length > 0) {
    log.info({ requeued, exhausted: exhausted.length }, "stale jobs recovered");
  }
  return { requeued, exhausted };
}

export function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, LAST_ERROR_MAX_LENGTH);
}
