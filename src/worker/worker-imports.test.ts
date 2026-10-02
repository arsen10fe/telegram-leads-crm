import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function moduleEntryPoints(): string[] {
  const modulesDir = path.join(root, "src/modules");
  return readdirSync(modulesDir)
    .map((name) => path.join(modulesDir, name, "index.ts"))
    .filter((file) => existsSync(file));
}

describe("worker imports", () => {
  it("loads the job handlers and every module's public API under plain Node", () => {
    const files = [path.join(root, "src/worker/job-handlers.ts"), ...moduleEntryPoints()];

    const output = execFileSync("npx", ["tsx", "src/worker/import-check.ts", ...files], {
      cwd: root,
      env: { ...process.env, LOG_LEVEL: "silent" },
      encoding: "utf8",
      timeout: 60_000,
    });

    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(output).toContain("worker imports ok");
  }, 60_000);
});
