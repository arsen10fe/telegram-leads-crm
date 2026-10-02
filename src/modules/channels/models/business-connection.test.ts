import { describe, expect, it } from "vitest";
import { BUSINESS_REPLY_WINDOW_MS, businessWindowClosesAt, canReplyInBusinessChat } from "./business-connection";

const now = new Date("2026-10-02T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const ready = { isEnabled: true, canReply: true };

describe("canReplyInBusinessChat", () => {
  it("allows a reply within 24 hours of the client's last message", () => {
    expect(canReplyInBusinessChat(ready, hoursAgo(23.9), now)).toBe(true);
  });

  it.each([
    ["the connection is disabled", { isEnabled: false, canReply: true }, hoursAgo(1)],
    ["the bot has no right to reply", { isEnabled: true, canReply: false }, hoursAgo(1)],
    ["the window is over", ready, new Date(now.getTime() - BUSINESS_REPLY_WINDOW_MS)],
    ["the client never wrote", ready, null],
  ])("refuses when %s", (_case, connection, lastInboundAt) => {
    expect(canReplyInBusinessChat(connection, lastInboundAt, now)).toBe(false);
  });

  it("refuses without a connection", () => {
    expect(canReplyInBusinessChat(null, hoursAgo(1), now)).toBe(false);
  });
});

describe("businessWindowClosesAt", () => {
  it("is 24 hours after the last client message, or null once closed", () => {
    expect(businessWindowClosesAt(hoursAgo(2), now)?.toISOString()).toBe("2026-10-03T10:00:00.000Z");
    expect(businessWindowClosesAt(hoursAgo(25), now)).toBeNull();
    expect(businessWindowClosesAt(null, now)).toBeNull();
  });
});
