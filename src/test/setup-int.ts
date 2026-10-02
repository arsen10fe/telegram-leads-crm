// Loaded before every *.int.test.ts file (vitest project "int").
import { afterAll, beforeEach } from "vitest";
import { disconnectDb } from "@/shared/db";
import { truncateAll } from "./db";
import { assertTestDatabaseUrl } from "./test-database-url";

assertTestDatabaseUrl(process.env.DATABASE_URL);

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await disconnectDb();
});
