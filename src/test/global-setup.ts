import { execFileSync } from "node:child_process";
import { createLogger } from "../shared/logger";
import { assertTestDatabaseUrl } from "./test-database-url";

const log = createLogger("test.global-setup");

/** Brings the test database schema up to date once per run. Never resets it. */
export default function setup(): void {
  const url = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const startedAt = Date.now();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    // An explicit DATABASE_URL wins over .env (prisma.config.ts loads .env without overriding).
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  log.info({ ms: Date.now() - startedAt }, "migrations applied to the test database");
}
