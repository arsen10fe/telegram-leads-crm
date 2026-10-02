import { createLogger } from "../logger";
import { claimNext, complete, describeError, fail, failPermanently, recoverStale } from "./queue";
import {
  isJobType,
  JobPayloadSchemas,
  type ClaimedJob,
  type JobContext,
  type JobFinalFailureHandlers,
  type JobHandler,
  type JobHandlerResult,
  type JobHandlers,
  type JobPayloads,
  type JobType,
} from "./types";

const log = createLogger("jobs.runner");

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 60_000;
/** How often the loop looks for jobs a killed worker left `running`. */
const RECOVERY_INTERVAL_MS = 60_000;

export type JobRunnerOptions = {
  handlers: JobHandlers;
  onFinalFailure?: JobFinalFailureHandlers;
  pollMs?: number;
  timeoutMs?: number;
};

export type JobRunner = { stop(): Promise<void> };

type RunOptions = Pick<JobRunnerOptions, "handlers" | "onFinalFailure" | "timeoutMs">;

/** Claims and runs one due job. Returns false when nothing is due. */
export async function processNextJob(options: RunOptions): Promise<boolean> {
  const job = await claimNext();
  if (!job) return false;
  await runJob(job, options);
  return true;
}

/** Returns jobs a dead worker left behind to the queue, and finalizes those out of attempts. */
export async function recoverStaleJobs(options: Pick<JobRunnerOptions, "onFinalFailure">, now?: Date): Promise<void> {
  const { exhausted } = await recoverStale(now);
  for (const job of exhausted) {
    log.error({ jobId: job.id, type: job.type, attempts: job.attempts }, "job gave up: worker stopped while it was running");
    await runFinalFailure(job, "Worker stopped while the job was running", options.onFinalFailure);
  }
}

async function runJob(job: ClaimedJob, options: RunOptions): Promise<void> {
  const startedAt = Date.now();
  const context: JobContext = { jobId: job.id, attempt: job.attempts };
  log.debug({ jobId: job.id, type: job.type, attempt: job.attempts }, "job claimed");

  if (!isJobType(job.type)) {
    await failPermanently(job.id, new Error(`Unknown job type: ${job.type}`));
    log.error({ jobId: job.id, type: job.type }, "job failed: unknown type");
    return;
  }
  const parsed = JobPayloadSchemas[job.type].safeParse(job.payload);
  if (!parsed.success) {
    await failPermanently(job.id, parsed.error);
    log.error({ jobId: job.id, type: job.type }, "job failed: invalid payload");
    return;
  }

  try {
    const handler = options.handlers[job.type] as JobHandler<JobType>;
    const result = await withTimeout(handler(parsed.data, context), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    await complete(job.id);
    logCompleted(job, result, Date.now() - startedAt);
  } catch (error) {
    await handleFailure(job, error, options.onFinalFailure);
  }
}

function logCompleted(job: ClaimedJob, result: JobHandlerResult, ms: number): void {
  if (result === "skipped_superseded") {
    log.info({ jobId: job.id, type: job.type }, "job skipped: superseded by a newer message");
    return;
  }
  log.debug({ jobId: job.id, type: job.type, attempt: job.attempts, ms }, "job completed");
}

async function handleFailure(job: ClaimedJob, error: unknown, onFinalFailure: JobFinalFailureHandlers | undefined): Promise<void> {
  const failure = await fail(job, error);
  if (failure.outcome === "retry") {
    log.warn(
      { jobId: job.id, type: job.type, attempt: job.attempts, nextRunAt: failure.nextRunAt, error: describeError(error) },
      "job failed, retry scheduled",
    );
    return;
  }
  const lastError = describeError(error);
  log.error({ jobId: job.id, type: job.type, attempts: job.attempts, lastError }, "job gave up");
  await runFinalFailure(job, lastError, onFinalFailure);
}

/** The per-type last resort (mark AI failed, hand off to a manager). Its own errors are only logged. */
async function runFinalFailure(job: ClaimedJob, lastError: string, onFinalFailure: JobFinalFailureHandlers | undefined): Promise<void> {
  if (!isJobType(job.type)) return;
  const parsed = JobPayloadSchemas[job.type].safeParse(job.payload);
  const finalHandler = onFinalFailure?.[job.type] as
    | ((payload: JobPayloads[JobType], lastError: string) => Promise<void>)
    | undefined;
  if (!parsed.success || !finalHandler) return;
  try {
    await finalHandler(parsed.data, lastError);
  } catch (finalError) {
    log.error({ jobId: job.id, type: job.type, err: finalError }, "final-failure handler failed");
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Job timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs jobs one at a time until stopped. `stop()` lets the current job finish (graceful shutdown).
 * Stale `running` jobs are recovered at start and then every minute, not only on a restart.
 */
export function startJobRunner(options: JobRunnerOptions): JobRunner {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  let stopping = false;
  let wake: (() => void) | undefined;
  let lastRecoveryAt = 0;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = undefined;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      };
    });

  const recoverIfDue = async () => {
    if (Date.now() - lastRecoveryAt < RECOVERY_INTERVAL_MS) return;
    lastRecoveryAt = Date.now();
    try {
      await recoverStaleJobs(options);
    } catch (error) {
      log.error({ err: error }, "stale job recovery failed");
    }
  };

  const loop = async () => {
    log.info({ pollMs, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS }, "job runner started");
    while (!stopping) {
      await recoverIfDue();
      let processed = false;
      try {
        processed = await processNextJob(options);
      } catch (error) {
        // e.g. the database is unreachable: wait and try again.
        log.error({ err: error }, "job loop iteration failed");
      }
      if (!processed && !stopping) await sleep(pollMs);
    }
    log.info("job runner stopped");
  };

  const finished = loop();
  return {
    async stop() {
      stopping = true;
      wake?.();
      await finished;
    },
  };
}
