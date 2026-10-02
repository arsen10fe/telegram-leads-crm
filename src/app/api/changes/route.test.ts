// PERF-01: the poll target of <AutoRefresh>. Signed-out callers get nothing; failures say "try later".
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const computeChangeStamp = vi.fn();
vi.mock("@/app/_lib/session", () => ({ getSession }));
vi.mock("@/app/_lib/change-stamp", () => ({ computeChangeStamp }));

const { GET } = await import("./route");

describe("GET /api/changes", () => {
  beforeEach(() => {
    getSession.mockReset();
    computeChangeStamp.mockReset();
  });

  it("answers 401 without a session and never reads the data", async () => {
    getSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Нужно войти" } });
    expect(computeChangeStamp).not.toHaveBeenCalled();
  });

  it("returns the stamp to a manager, never cached", async () => {
    getSession.mockResolvedValue({ userId: "u1", user: { id: "u1" } });
    computeChangeStamp.mockResolvedValue("abc.1:2026");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ stamp: "abc.1:2026" });
  });

  it("answers 503 when the database is unreachable, so the page simply tries again", async () => {
    getSession.mockResolvedValue({ userId: "u1", user: { id: "u1" } });
    computeChangeStamp.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("unavailable");
  });
});
