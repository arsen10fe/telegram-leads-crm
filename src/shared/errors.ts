import { z, ZodError } from "zod";
import { createLogger } from "./logger";

const log = createLogger("errors");

/** An expected failure with a stable machine-readable code. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type ErrorEnvelope = { error: { code: string; message: string; details?: unknown } };

export function toErrorEnvelope(error: unknown): { status: number; body: ErrorEnvelope } {
  if (error instanceof AppError) {
    const details = error.details === undefined ? {} : { details: error.details };
    return { status: error.status, body: { error: { code: error.code, message: error.message, ...details } } };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "validation_error",
          message: "Проверьте введённые данные",
          details: z.flattenError(error),
        },
      },
    };
  }
  log.error({ err: error }, "unexpected error");
  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Что-то пошло не так. Попробуйте ещё раз." } },
  };
}

/** Prisma unique-constraint violation (P2002): the idempotency keys rely on it. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002"
  );
}
