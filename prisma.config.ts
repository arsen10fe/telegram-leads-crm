import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer loads .env by itself. Variables that are already set win (containers, tests).
try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional: containers and CI pass real env vars.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
