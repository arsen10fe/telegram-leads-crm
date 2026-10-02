"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, maskEmail } from "@/modules/auth";
import { createLogger } from "@/shared/logger";
import { createRateLimiter } from "../_lib/rate-limit";
import { clearSessionCookie, setSessionCookie } from "../_lib/session";
import { safeNextPath } from "../_lib/session-cookie";

const log = createLogger("web.login");

// 5 attempts per minute per client IP.
const loginLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export type LoginFormState = { error: string | null };

async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  const realIp = requestHeaders.get("x-real-ip");
  if (realIp) return realIp;
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function loginAction(_previous: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = LoginInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Введите e-mail и пароль" };

  if (!loginLimiter.take(await clientIp())) {
    log.warn({ reason: "rate_limited", emailMasked: maskEmail(parsed.data.email) }, "login failed");
    return { error: "Слишком много попыток. Подождите минуту и попробуйте снова." };
  }

  const result = await auth.login(parsed.data.email, parsed.data.password);
  if (!result) return { error: "Неверный e-mail или пароль" };

  await setSessionCookie(result.token);
  redirect(safeNextPath(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  log.info("logout");
  redirect("/login");
}
