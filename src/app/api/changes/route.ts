import { computeChangeStamp } from "@/app/_lib/change-stamp";
import { getSession } from "@/app/_lib/session";
import { createLogger } from "@/shared/logger";

export const dynamic = "force-dynamic";

const log = createLogger("changes");

/** Polled by <AutoRefresh> every few seconds: a ~100-byte answer instead of a page re-render. */
export async function GET() {
  try {
    if (!(await getSession())) {
      return Response.json({ error: { code: "unauthorized", message: "Нужно войти" } }, { status: 401 });
    }
    const stamp = await computeChangeStamp();
    log.debug({ fix: "PERF-01", stamp }, "change stamp served");
    return Response.json({ stamp }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    log.warn({ fix: "PERF-01", err: error }, "change stamp failed");
    return Response.json({ error: { code: "unavailable", message: "Сервис временно недоступен" } }, { status: 503 });
  }
}
