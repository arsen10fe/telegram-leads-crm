import { describe, expect, it } from "vitest";
import { TAG_COLORS } from "@/modules/leads";
import { tagColorClasses, UI_TAG_COLORS } from "./tag-colors";

describe("tag colors", () => {
  it("cover exactly the palette of the leads module", () => {
    expect([...UI_TAG_COLORS].sort()).toEqual([...TAG_COLORS].sort());
  });

  it("fall back to slate for unknown colors", () => {
    expect(tagColorClasses("ultraviolet")).toBe(tagColorClasses("slate"));
  });
});
