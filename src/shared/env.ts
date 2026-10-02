import { z } from "zod";
import { createLogger } from "./logger";

const log = createLogger("env");

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    // Optional here so the CRM runs before a bot exists; the worker refuses to start without it.
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_BOT_USERNAME: z
      .string()
      .transform((value) => value.replace(/^@/, ""))
      .optional(),
    AI_ENABLED: z.stringbool().default(false),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL_FAST: z.string().default("gpt-5.4-nano"),
    OPENAI_MODEL_SMART: z.string().default("gpt-5.4-mini"),
    OPENAI_PROXY_URL: z.url().optional(),
    SEED_MANAGER_EMAIL: z.email().optional(),
    SEED_MANAGER_PASSWORD: z.string().min(8).optional(),
    SHOW_DEMO_CREDENTIALS: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    if (env.AI_ENABLED && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "is required when AI_ENABLED=true",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Validates an env source. Empty values count as unset, so `KEY=` in .env falls back to defaults. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ""),
  );
  const result = EnvSchema.safeParse(present);
  if (result.success) return result.data;

  // Names only: values may be secrets.
  const invalidKeys = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "?")))];
  log.error({ invalidKeys }, "invalid environment variables");
  throw new Error(`Invalid environment variables: ${invalidKeys.join(", ")}`);
}

let cachedEnv: Env | undefined;

/**
 * Lazy and memoized: nothing reads env at import time, so `next build` never needs runtime
 * secrets.
 */
export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
