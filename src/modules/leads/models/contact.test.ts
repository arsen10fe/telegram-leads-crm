import { describe, expect, it } from "vitest";
import { parseContact, parsePhone, telegramContact } from "./contact";

describe("parseContact", () => {
  it.each([
    ["8 (912) 345-67-89", { type: "phone", value: "+79123456789" }],
    ["+7 912 345 67 89", { type: "phone", value: "+79123456789" }],
    ["79123456789", { type: "phone", value: "+79123456789" }],
    ["9123456789", { type: "phone", value: "+79123456789" }],
    ["4951234567", { type: "phone", value: "+74951234567" }],
    ["+44 20 7946 0958", { type: "phone", value: "+442079460958" }],
    ["@petr_ivanov", { type: "telegram", value: "@petr_ivanov" }],
    ["t.me/petr_ivanov", { type: "telegram", value: "@petr_ivanov" }],
    ["https://t.me/petr_ivanov", { type: "telegram", value: "@petr_ivanov" }],
    ["  Petr@Example.COM ", { type: "email", value: "petr@example.com" }],
  ])("%s", (raw, expected) => {
    expect(parseContact(raw)).toEqual(expected);
  });

  it.each([["привет"], ["12345"], ["тел 89123456789"], ["@abc"], ["user@localhost"], [""], ["   "]])(
    "rejects %j",
    (raw) => {
      expect(parseContact(raw)).toBeNull();
    },
  );
});

describe("parsePhone", () => {
  it("accepts a phone shared through the Telegram button", () => {
    expect(parsePhone("79123456789")).toEqual({ type: "phone", value: "+79123456789" });
    expect(parsePhone("+79123456789")).toEqual({ type: "phone", value: "+79123456789" });
  });
});

describe("telegramContact", () => {
  it("prefers the username and falls back to a tg:// link", () => {
    expect(telegramContact({ id: 7, username: "petr" })).toEqual({ type: "telegram", value: "@petr" });
    expect(telegramContact({ id: 7 })).toEqual({ type: "telegram", value: "tg://user?id=7" });
  });
});
