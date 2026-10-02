import { describe, expect, it } from "vitest";
import { ALLOWED_UPDATES } from "./create-bot";
import { createBotHarness, updates } from "./test/bot-harness";

describe("createBot", () => {
  it("handles an update type it does not know without throwing or replying", async () => {
    const { send, calls } = createBotHarness();

    await expect(send(updates.unknown())).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("asks Telegram for business updates explicitly", () => {
    expect(ALLOWED_UPDATES).toEqual(
      expect.arrayContaining(["message", "business_connection", "business_message", "edited_business_message"]),
    );
  });
});
