import { describe, expect, it } from "vitest";
import { DEFAULT_TRIGGER_WORDS } from "@/modules/settings";
import { matchTriggers } from "./triggers";

describe("matchTriggers", () => {
  it.each([
    [["Пришлите договор"], ["договор*"], "договор*"],
    [["Можно ДОГОВОРОМ?"], ["договор*"], "договор*"],
    [["Позовите живого человека"], ["живой человек"], null], // a phrase needs its exact form
    [["Нужен живой человек, а не бот"], ["живой человек"], "живой человек"],
    [["хочу поговорить с менеджером"], ["менеджер*"], "менеджер*"],
    [["Сколько стоит лендинг?"], ["договор*", "оплат*"], null],
    [["Ещё вопрос по оплате"], ["оплат*"], "оплат*"],
    [["Пришлите КП"], ["кп"], "кп"],
    [["КПД у вас какой?"], ["кп"], null], // exact token, not a prefix
    [["ёлки-палки, где счёт?"], ["счет"], "счет"], // ё = е
  ])("%j with %j → %s", (texts, patterns, expected) => {
    expect(matchTriggers(texts, patterns)?.pattern ?? null).toBe(expected);
  });

  it("ignores empty patterns", () => {
    expect(matchTriggers(["что угодно"], ["", "  ", "*"])).toBeNull();
  });

  it("does not treat price questions as triggers by default", () => {
    expect(matchTriggers(["Сколько стоит лендинг? Какая цена?"], DEFAULT_TRIGGER_WORDS)).toBeNull();
    expect(matchTriggers(["Можно скидку?"], DEFAULT_TRIGGER_WORDS)?.pattern).toBe("скидк*");
  });
});
