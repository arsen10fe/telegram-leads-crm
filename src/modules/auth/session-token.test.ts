import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, signSession, verifySessionToken } from "./session-token";

const SECRET = "s".repeat(40);

describe("session token", () => {
  it("round-trips the user id", async () => {
    const token = await signSession("user_1", SECRET);

    expect(await verifySessionToken(token, SECRET)).toEqual({ ok: true, userId: "user_1" });
  });

  it("rejects an expired token", async () => {
    const issuedAt = new Date("2026-10-01T00:00:00Z");
    const token = await signSession("user_1", SECRET, issuedAt);
    const afterExpiry = new Date(issuedAt.getTime() + (SESSION_TTL_SECONDS + 60) * 1000);

    expect(await verifySessionToken(token, SECRET, afterExpiry)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession("user_1", SECRET);
    const [header, payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", exp: 9_999_999_999 })).toString("base64url");

    expect(await verifySessionToken(`${header}.${forgedPayload}.${signature}`, SECRET)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(payload).toBeTruthy();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession("user_1", "x".repeat(40));

    expect(await verifySessionToken(token, SECRET)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects garbage", async () => {
    expect(await verifySessionToken("not-a-jwt", SECRET)).toEqual({ ok: false, reason: "invalid" });
  });
});
