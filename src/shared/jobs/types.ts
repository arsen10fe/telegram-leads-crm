import { z } from "zod";

const id = z.string().min(1);

/** Every job type and its payload. Payloads are validated on enqueue and again when claimed. */
export const JobPayloadSchemas = {
  qualify_lead: z.object({ leadId: id, messageId: id.optional() }),
  autopilot_reply: z.object({ leadId: id, messageId: id }),
  notify_new_lead: z.object({ leadId: id }),
  notify_handoff: z.object({ leadId: id }),
};

export type JobType = keyof typeof JobPayloadSchemas;
export type JobPayloads = { [K in JobType]: z.infer<(typeof JobPayloadSchemas)[K]> };

export const JOB_TYPES = Object.keys(JobPayloadSchemas) as JobType[];

export function isJobType(value: string): value is JobType {
  return value in JobPayloadSchemas;
}

export type JobContext = { jobId: string; attempt: number };

/** A handler may report that a newer message made this job pointless (debounce by superseding). */
export type JobHandlerResult = void | "skipped_superseded";

export type JobHandler<K extends JobType> = (
  payload: JobPayloads[K],
  context: JobContext,
) => Promise<JobHandlerResult>;

export type JobHandlers = { [K in JobType]: JobHandler<K> };

/** Called once a job has used up all attempts (e.g. mark AI as failed, hand the lead off). */
export type JobFinalFailureHandlers = {
  [K in JobType]?: (payload: JobPayloads[K], lastError: string) => Promise<void>;
};

export type EnqueueOptions = { delayMs?: number; maxAttempts?: number };

export type ClaimedJob = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};
