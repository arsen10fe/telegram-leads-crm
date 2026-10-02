import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

// The probe is injected in every test, so the real Prisma client is never loaded.
vi.mock("./db", () => ({ db: {} }));
vi.mock("./logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./logger")>()),
  createLogger: () => log,
}));

import { isDatabaseUnavailable, waitForDatabase } from "./db-ready";

function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    sleeps,
  };
}

function pingFailing(times: number) {
  let calls = 0;
  return vi.fn(async () => {
    calls += 1;
    if (calls <= times) throw new Error("connect ECONNREFUSED 172.23.0.2:5432");
  });
}

describe("waitForDatabase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves on the first answer without waiting", async () => {
    const clock = fakeClock();
    const ping = pingFailing(0);

    await waitForDatabase({ ping, sleep: clock.sleep, now: clock.now });

    expect(ping).toHaveBeenCalledTimes(1);
    expect(clock.sleeps).toEqual([]);
    expect(log.info).toHaveBeenCalledWith({ attempts: 1, elapsedMs: 0 }, "database ready");
  });

  it("retries until the database answers, warning on every failed attempt", async () => {
    const clock = fakeClock();
    const ping = pingFailing(3);

    await waitForDatabase({ ping, sleep: clock.sleep, now: clock.now });

    expect(ping).toHaveBeenCalledTimes(4);
    expect(clock.sleeps).toEqual([2_000, 2_000, 2_000]);
    expect(log.warn.mock.calls.map(([fields]) => fields.attempt)).toEqual([1, 2, 3]);
    expect(log.warn.mock.calls[0]?.[0]).toMatchObject({ errorClass: "Error", message: expect.stringContaining("ECONNREFUSED") });
    expect(log.info).toHaveBeenCalledWith({ attempts: 4, elapsedMs: 6_000 }, "database ready");
  });

  it("gives up after the deadline with one last attempt exactly at it", async () => {
    const clock = fakeClock();
    const ping = pingFailing(Number.POSITIVE_INFINITY);

    await expect(
      waitForDatabase({ ping, timeoutMs: 5_000, intervalMs: 2_000, sleep: clock.sleep, now: clock.now }),
    ).rejects.toThrow("Database unreachable after 4 attempts in 5000 ms");

    expect(ping).toHaveBeenCalledTimes(4);
    expect(log.error).toHaveBeenCalledWith({ attempts: 4, timeoutMs: 5_000 }, "database still unreachable: giving up");
  });

  it("never sleeps past the deadline", async () => {
    const clock = fakeClock();

    await expect(
      waitForDatabase({ ping: pingFailing(Number.POSITIVE_INFINITY), timeoutMs: 5_000, intervalMs: 2_000, sleep: clock.sleep, now: clock.now }),
    ).rejects.toThrow();

    expect(clock.sleeps).toEqual([2_000, 2_000, 1_000]);
    expect(clock.sleeps.reduce((sum, ms) => sum + ms, 0)).toBe(5_000);
  });
});

describe("isDatabaseUnavailable", () => {
  const adapterError = (cause: Record<string, unknown>, code = "P2010") =>
    Object.assign(new Error("query failed"), { code, meta: { driverAdapterError: { name: "DriverAdapterError", cause } } });

  it.each([
    ["adapter: DatabaseNotReachable (captured shape)", adapterError({ kind: "DatabaseNotReachable", host: "postgres" })],
    ["adapter: ConnectionClosed", adapterError({ kind: "ConnectionClosed" }, "P1017")],
    ["adapter: Postgres shutting down (57P01)", adapterError({ kind: "postgres", code: "57P01" })],
    ["adapter: Postgres starting up (57P03)", adapterError({ kind: "postgres", code: "57P03" })],
    ["Prisma P1001", Object.assign(new Error("Can't reach database server"), { code: "P1001" })],
    ["Prisma P2024 (pool timeout)", Object.assign(new Error("Timed out fetching a new connection"), { code: "P2024" })],
    ["DNS failure while the container restarts", new Error("Invalid `prisma.$queryRaw()` invocation:\n\ngetaddrinfo EAI_AGAIN postgres")],
    ["refused connection in a nested cause", new Error("wrapped", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) })],
  ])("%s → unavailable", (_label, error) => {
    expect(isDatabaseUnavailable(error)).toBe(true);
  });

  it.each([
    ["unique violation", Object.assign(new Error("Unique constraint failed"), { code: "P2002" })],
    ["adapter: a normal Postgres error", adapterError({ kind: "postgres", code: "23505" })],
    ["a bug in our code", new TypeError("Cannot read properties of undefined")],
    ["not an error at all", "oops"],
    ["null", null],
  ])("%s → not a database outage", (_label, error) => {
    expect(isDatabaseUnavailable(error)).toBe(false);
  });
});
