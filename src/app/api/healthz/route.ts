import { db } from "@/shared/db";
import { createLogger } from "@/shared/logger";

export const dynamic = "force-dynamic";

const log = createLogger("healthz");

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (error) {
    log.warn({ err: error }, "health check failed: database unreachable");
    return Response.json({ status: "error" }, { status: 503 });
  }
}
