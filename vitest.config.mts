import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { configDefaults, defineConfig } from "vitest/config";

// Only TEST_DATABASE_URL is taken from the local .env: the dev database, bot token and OpenAI key
// must never leak into tests.
function readTestDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  try {
    return parseEnv(readFileSync(".env", "utf8")).TEST_DATABASE_URL || undefined;
  } catch {
    return undefined; // .env is optional
  }
}

const testDatabaseUrl = readTestDatabaseUrl();
// The global setup runs in this process and migrates the test database.
if (testDatabaseUrl) process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    testTimeout: 15_000,
    env: {
      // Unit tests never reach a database.
      DATABASE_URL: "postgresql://unit-tests@127.0.0.1:1/no-database",
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
      AI_ENABLED: "false",
      AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
      APP_URL: "http://localhost:3100",
      TELEGRAM_BOT_TOKEN: "123456:TEST",
      TELEGRAM_BOT_USERNAME: "lidogram_test_bot",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.int.test.ts"],
        },
      },
      // Integration tests (*.int.test.ts) need a Postgres test database: they run only when
      // TEST_DATABASE_URL is set. They share that database, so files run one at a time.
      ...(testDatabaseUrl
        ? [
            {
              extends: true as const,
              test: {
                name: "int",
                include: ["src/**/*.int.test.ts"],
                fileParallelism: false,
                globalSetup: ["src/test/global-setup.ts"],
                setupFiles: ["src/test/setup-int.ts"],
                env: { DATABASE_URL: testDatabaseUrl },
              },
            },
          ]
        : []),
    ],
  },
});
