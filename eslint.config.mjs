import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Cross-module imports go through the module's public index.ts only.
const deepModuleImport = {
  group: ["@/modules/*/*"],
  message: "Import other modules through their public API (@/modules/<name>), never deep paths.",
};

// src/modules, src/shared and src/worker also run inside the bot worker under plain Node (tsx).
// There `server-only` throws on import, and Next/React APIs do not exist.
const frameworkFreeImports = {
  paths: [
    { name: "server-only", message: "Throws under plain Node (bot worker). Allowed only in src/app." },
    { name: "next", message: "Modules must stay framework-free: the bot worker imports them." },
    { name: "react", message: "Modules must stay framework-free: the bot worker imports them." },
    { name: "react-dom", message: "Modules must stay framework-free: the bot worker imports them." },
  ],
  patterns: [
    { group: ["next/*"], message: "Keep next/* (cookies, redirects, revalidatePath) in src/app." },
    {
      group: ["@/app/*", "@/components/*", "@/lib/*"],
      message: "Modules must not depend on the web layer (src/app, src/components, src/lib).",
    },
    deepModuleImport,
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [deepModuleImport] }],
    },
  },
  {
    files: ["src/modules/**/*.ts", "src/shared/**/*.ts", "src/worker/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", frameworkFreeImports],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
