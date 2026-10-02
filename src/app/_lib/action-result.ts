import "server-only";
import { z, ZodError } from "zod";
import { AppError } from "@/shared/errors";
import { createLogger } from "@/shared/logger";

const log = createLogger("web.actions");

export type ActionError = { code: string; message: string; fieldErrors?: Record<string, string[]> };
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/** Maps a failure to a Russian message for a toast. Unknown errors are logged with their stack. */
export function fail(action: string, error: unknown, context: Record<string, unknown> = {}): ActionResult<never> {
  if (error instanceof ZodError) {
    const flattened = z.flattenError(error);
    const fieldErrors = flattened.fieldErrors as Record<string, string[]>;
    // Field names only: values may be personal data.
    log.warn({ action, ...context, fields: Object.keys(fieldErrors) }, "action validation failed");
    const firstMessage = Object.values(fieldErrors).flat()[0] ?? flattened.formErrors[0];
    return { ok: false, error: { code: "validation_error", message: firstMessage ?? "Проверьте введённые данные", fieldErrors } };
  }
  if (error instanceof AppError) {
    log.warn({ action, ...context, code: error.code }, "action failed");
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  log.error({ action, ...context, err: error }, "action crashed");
  return { ok: false, error: { code: "internal_error", message: "Что-то пошло не так. Попробуйте ещё раз." } };
}
