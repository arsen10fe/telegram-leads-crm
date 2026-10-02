import pino, { type Logger, type LevelWithSilent } from "pino";

// The logger reads LOG_LEVEL straight from process.env instead of going through getEnv():
// env validation itself logs its failures, so the logger must work before env is valid.
const LEVELS: readonly LevelWithSilent[] = ["trace", "debug", "info", "warn", "error", "fatal", "silent"];

function resolveLevel(): LevelWithSilent {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  return LEVELS.find((level) => level === raw) ?? "info";
}

// Never let secrets reach the logs, even if a caller logs a whole object by mistake.
const REDACT_PATHS = [
  "token",
  "*.token",
  "*.*.token",
  "linkToken",
  "*.linkToken",
  "apiKey",
  "*.apiKey",
  "secret",
  "*.secret",
  "password",
  "*.password",
  "*.*.password",
  "passwordHash",
  "*.passwordHash",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

function createRootLogger(): Logger {
  const isDevelopment = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  const usePretty = isDevelopment && process.env.LOG_PRETTY !== "0";
  return pino({
    level: resolveLevel(),
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    // pino-pretty is a dev dependency: never enable the transport in production.
    ...(usePretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
          },
        }
      : {}),
  });
}

// Next.js dev re-evaluates modules on every change; keep one root logger (one pretty-print worker
// thread) per process.
const globalForLogger = globalThis as unknown as { lidogramLogger?: Logger };

export const logger: Logger = globalForLogger.lidogramLogger ?? createRootLogger();
globalForLogger.lidogramLogger = logger;

export function createLogger(module: string): Logger {
  return logger.child({ module });
}

export function errorInfo(error: unknown): { errorClass: string; message: string } {
  if (error instanceof Error) return { errorClass: error.name, message: error.message };
  return { errorClass: typeof error, message: String(error) };
}
