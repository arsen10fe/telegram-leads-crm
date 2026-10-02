import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/db",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults for optional settings", () => {
    const env = parseEnv(base);

    expect(env.LOG_LEVEL).toBe("info");
    expect(env.AI_ENABLED).toBe(false);
    expect(env.SHOW_DEMO_CREDENTIALS).toBe(false);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.NODE_ENV).toBe("development");
  });

  it("treats empty values as unset", () => {
    const env = parseEnv({ ...base, OPENAI_PROXY_URL: "", LOG_LEVEL: " " });

    expect(env.OPENAI_PROXY_URL).toBeUndefined();
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects AI_ENABLED=true without an OpenAI key", () => {
    expect(() => parseEnv({ ...base, AI_ENABLED: "true" })).toThrow(/OPENAI_API_KEY/);
  });

  it("accepts AI_ENABLED=true with a key", () => {
    const env = parseEnv({ ...base, AI_ENABLED: "true", OPENAI_API_KEY: "sk-test" });

    expect(env.AI_ENABLED).toBe(true);
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(() => parseEnv({ ...base, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });

  it("rejects a short AUTH_SECRET and names only the key, never the value", () => {
    const secret = "too-short-secret";

    expect(() => parseEnv({ ...base, AUTH_SECRET: secret })).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv({ ...base, AUTH_SECRET: secret })).not.toThrow(new RegExp(secret));
  });

  it("strips a leading @ from the bot username", () => {
    expect(parseEnv({ ...base, TELEGRAM_BOT_USERNAME: "@agency_bot" }).TELEGRAM_BOT_USERNAME).toBe("agency_bot");
  });
});
