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

  it.each([
    [["живой   человек нужен"], ["живой человек"], "живой человек"], // extra spaces
    [["нужен живой\nчеловек"], ["живой человек"], "живой человек"], // a line break
    [["Позовите живого человека"], ["жив* человек*"], "жив* человек*"], // inflected forms
    [["Хочу поговорить с живым человеком"], ["жив* человек*"], "жив* человек*"],
    [["Пришлите коммерческое предложение"], ["коммерческ* предложени*"], "коммерческ* предложени*"],
    [["интеграция с 1С нужна"], ["1с"], "1с"], // digits are part of a word
    [["Живой отклик, человек"], ["жив* человек*"], null], // words must be adjacent
    [["живой", "человек"], ["живой человек"], null], // never across two messages
  ])("DEF-06: phrases are matched word by word — %j with %j → %s", (texts, patterns, expected) => {
    expect(matchTriggers(texts, patterns)?.pattern ?? null).toBe(expected);
  });

  it("DEF-06: the default list hands natural requests for a human, an offer or payment to a manager", () => {
    for (const text of ["Хочу поговорить с живым человеком", "Позовите живого человека", "Пришлите коммерческое предложение", "оплачу завтра, ок?"]) {
      expect(matchTriggers([text], DEFAULT_TRIGGER_WORDS), text).not.toBeNull();
    }
  });

  it("ignores empty patterns", () => {
    expect(matchTriggers(["что угодно"], ["", "  ", "*"])).toBeNull();
  });

  it("does not treat price questions as triggers by default", () => {
    expect(matchTriggers(["Сколько стоит лендинг? Какая цена?"], DEFAULT_TRIGGER_WORDS)).toBeNull();
    expect(matchTriggers(["Можно скидку?"], DEFAULT_TRIGGER_WORDS)?.pattern).toBe("скидк*");
  });
});
