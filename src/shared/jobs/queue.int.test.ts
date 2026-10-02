import { describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { claimNext, enqueue, recoverStale } from "./queue";
import { processNextJob, recoverStaleJobs } from "./runner";
import type { JobHandlers } from "./types";

function handlers(overrides: Partial<JobHandlers> = {}): JobHandlers {
  return {
    qualify_lead: vi.fn(async () => undefined),
    autopilot_reply: vi.fn(async () => undefined),
    notify_new_lead: vi.fn(async () => undefined),
    notify_handoff: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("job queue", () => {
  it("leaves no job behind when the enqueuing transaction rolls back", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await enqueue(tx, "notify_new_lead", { leadId: "lead_1" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(await db.job.count()).toBe(0);
  });

  it("rejects an invalid payload at enqueue time", async () => {
    await expect(enqueue(db, "autopilot_reply", { leadId: "lead_1" } as never)).rejects.toThrow();
  });

  it("never hands the same job to two concurrent claims", async () => {
    await enqueue(db, "notify_new_lead", { leadId: "lead_1" });

    const claims = await Promise.all([claimNext(), claimNext(), claimNext()]);
    const claimed = claims.filter((job) => job !== null);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.attempts).toBe(1);
  });

  it("gives distinct jobs to concurrent claims", async () => {
    await enqueue(db, "notify_new_lead", { leadId: "lead_1" });
    await enqueue(db, "notify_new_lead", { leadId: "lead_2" });

    const [first, second] = await Promise.all([claimNext(), claimNext()]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.id).not.toBe(second?.id);
  });

  it("does not claim a delayed job before its time", async () => {
    await enqueue(db, "qualify_lead", { leadId: "lead_1" }, { delayMs: 60_000 });

    expect(await claimNext()).toBeNull();
  });

  it("runs the handler with the validated payload and marks the job done", async () => {
    const qualify = vi.fn(async () => undefined);
    const jobId = await enqueue(db, "qualify_lead", { leadId: "lead_1", messageId: "msg_1" });

    expect(await processNextJob({ handlers: handlers({ qualify_lead: qualify }) })).toBe(true);

    expect(qualify).toHaveBeenCalledWith({ leadId: "lead_1", messageId: "msg_1" }, { jobId, attempt: 1 });
    expect((await db.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("done");
  });

  it("marks a superseded job done", async () => {
    const jobId = await enqueue(db, "autopilot_reply", { leadId: "lead_1", messageId: "msg_1" });

    await processNextJob({ handlers: handlers({ autopilot_reply: async () => "skipped_superseded" }) });

    expect((await db.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("done");
  });

  it("retries a failed job with backoff, then gives up and calls the final-failure handler", async () => {
    const onFinalFailure = vi.fn(async () => undefined);
    const failing = handlers({
      qualify_lead: async () => {
        throw new Error("boom");
      },
    });
    const jobId = await enqueue(db, "qualify_lead", { leadId: "lead_1" }, { maxAttempts: 2 });

    await processNextJob({ handlers: failing, onFinalFailure: { qualify_lead: onFinalFailure } });
    const afterFirst = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(afterFirst.status).toBe("pending");
    expect(afterFirst.lastError).toContain("boom");
    expect(afterFirst.runAt.getTime()).toBeGreaterThan(Date.now());

    // Make it due again instead of waiting for the backoff.
    await db.job.update({ where: { id: jobId }, data: { runAt: new Date(Date.now() - 1_000) } });
    await processNextJob({ handlers: failing, onFinalFailure: { qualify_lead: onFinalFailure } });

    const afterSecond = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(afterSecond.status).toBe("failed");
    expect(afterSecond.attempts).toBe(2);
    expect(onFinalFailure).toHaveBeenCalledWith({ leadId: "lead_1" }, expect.stringContaining("boom"));
  });

  it("fails a job with an unknown type without retrying", async () => {
    const job = await db.job.create({ data: { type: "unknown_type", payload: {} } });

    await processNextJob({ handlers: handlers() });

    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("failed");
  });

  it("returns jobs a dead worker left running to the queue, but leaves fresh ones alone", async () => {
    const stale = await db.job.create({
      data: { type: "notify_new_lead", payload: { leadId: "a" }, status: "running", attempts: 1 },
    });

    expect(await recoverStale()).toEqual({ requeued: 0, exhausted: [] }); // still within its time
    const result = await recoverStale(new Date(Date.now() + 3 * 60_000));

    expect(result).toEqual({ requeued: 1, exhausted: [] });
    expect((await db.job.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("pending");
  });

  it("does not re-run a stale job that used its last attempt: it fails and goes to its final handler", async () => {
    const onFinalFailure = vi.fn(async () => undefined);
    const job = await db.job.create({
      data: { type: "autopilot_reply", payload: { leadId: "lead_1", messageId: "m1" }, status: "running", attempts: 1, maxAttempts: 1 },
    });

    await recoverStaleJobs({ onFinalFailure: { autopilot_reply: onFinalFailure } }, new Date(Date.now() + 3 * 60_000));

    const stored = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toContain("Worker stopped");
    expect(onFinalFailure).toHaveBeenCalledWith({ leadId: "lead_1", messageId: "m1" }, expect.any(String));
  });

  it("takes an autopilot reply before other due jobs: a client is waiting for it", async () => {
    await enqueue(db, "qualify_lead", { leadId: "lead_1" });
    await enqueue(db, "notify_new_lead", { leadId: "lead_1" });
    await enqueue(db, "autopilot_reply", { leadId: "lead_1", messageId: "m1" });

    expect((await claimNext())?.type).toBe("autopilot_reply");
    expect((await claimNext())?.type).toBe("qualify_lead");
  });
});
