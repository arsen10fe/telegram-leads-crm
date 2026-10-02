// Loads the given files in a plain Node process (tsx), exactly the way the bot worker runs.
// `server-only` throws there, so a module that sneaks it in (or another web-only import that
// fails outside Next.js) breaks this check. Used by worker-imports.test.ts.
import { pathToFileURL } from "node:url";

for (const file of process.argv.slice(2)) {
  await import(pathToFileURL(file).href);
}
process.stdout.write("worker imports ok\n");
