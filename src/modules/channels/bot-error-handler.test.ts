import { BotError, GrammyError, type Context } from "grammy";
import type { Update } from "grammy/types";
import { describe, expect, it, vi } from "vitest";
import { createBotErrorHandler } from "./bot-error-handler";

/** The shape @prisma/adapter-pg produces when Postgres cannot be reached (captured 2026-10-02). */
function databaseUnreachable(): Error {
  return Object.assign(new Error("Raw query failed. Message: `Can't reach database server at postgres:5432`"), {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    meta: { driverAdapterError: { name: "DriverAdapterError", cause: { kind: "DatabaseNotReachable", host: "postgres" } } },
  });
}

const update = { update_id: 7, message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "hi" } } as Update;
const botError = (cause: unknown) => new BotError(cause, { update } as unknown as Context);

describe("createBotErrorHandler", () => {
  it("waits for the database and handles the same update again instead of dropping it", async () => {
    const handleAgain = vi.fn(async () => {});
    const waitForDatabase = vi.fn(async () => {});

    await createBotErrorHandler({ handleAgain, waitForDatabase })(botError(databaseUnreachable()));

    expect(waitForDatabase).toHaveBeenCalledTimes(1);
    expect(handleAgain).toHaveBeenCalledWith(update);
  });

  it("stops polling (throws) when the database stays unavailable, so Telegram redelivers the update", async () => {
    const handleAgain = vi.fn(async () => {
      throw botError(databaseUnreachable());
    });

    await expect(
      createBotErrorHandler({ handleAgain, waitForDatabase: async () => {}, maxRetries: 2 })(botError(databaseUnreachable())),
    ).rejects.toThrow();
    expect(handleAgain).toHaveBeenCalledTimes(2);
  });

  it("stops polling when the database does not come back in time", async () => {
    const waitForDatabase = vi.fn(async () => {
      throw new Error("Database unreachable after 9 attempts in 60000 ms");
    });

    await expect(createBotErrorHandler({ handleAgain: vi.fn(), waitForDatabase })(botError(databaseUnreachable()))).rejects.toThrow(
      "Database unreachable",
    );
  });

  it("logs and skips any other failure, so one bad update never blocks the bot", async () => {
    const handleAgain = vi.fn();
    const waitForDatabase = vi.fn();
    const handler = createBotErrorHandler({ handleAgain, waitForDatabase });

    await handler(botError(new TypeError("bug in a controller")));
    await handler(botError(new GrammyError("Forbidden", { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, "sendMessage", {})));

    expect(handleAgain).not.toHaveBeenCalled();
    expect(waitForDatabase).not.toHaveBeenCalled();
  });
});
