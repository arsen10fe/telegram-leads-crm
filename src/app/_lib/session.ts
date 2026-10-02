import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, SESSION_TTL_SECONDS, type SessionUser } from "@/modules/auth";
import { getEnv, isHttpsUrl } from "@/shared/env";
import { SESSION_COOKIE } from "./session-cookie";

export type Session = { userId: string; user: SessionUser };

/** The signed-in manager, or null. Checks the signature and that the user still exists. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const verified = await auth.verifySession(token);
  if (!verified) return null;
  const user = await auth.getUser(verified.userId);
  return user ? { userId: user.id, user } : null;
}

/** Use in every page, layout and Server Action that needs a manager — not only in proxy.ts. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // A `secure` cookie is dropped on plain http, which would make local login impossible.
    secure: isHttpsUrl(getEnv().APP_URL),
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
