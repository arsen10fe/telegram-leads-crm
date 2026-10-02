// Framework- and database-free on purpose: src/proxy.ts imports this file directly to check the
// cookie signature before a request reaches the app.
import { errors, jwtVerify, SignJWT } from "jose";

const ALGORITHM = "HS256";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SessionVerification = { ok: true; userId: string } | { ok: false; reason: "expired" | "invalid" };

function signingKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string, secret: string, now: Date = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .sign(signingKey(secret));
}

export async function verifySessionToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<SessionVerification> {
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), { algorithms: [ALGORITHM], currentDate: now });
    if (!payload.sub) return { ok: false, reason: "invalid" };
    return { ok: true, userId: payload.sub };
  } catch (error) {
    if (error instanceof errors.JWTExpired) return { ok: false, reason: "expired" };
    return { ok: false, reason: "invalid" };
  }
}
