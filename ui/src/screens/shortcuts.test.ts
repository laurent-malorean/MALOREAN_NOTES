import { describe, expect, it } from "vitest";
import { shortcutFor } from "./shortcuts";

const key = (
  key: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey", boolean>> = {},
) => shortcutFor({ key, metaKey: false, ctrlKey: false, shiftKey: false, ...mods });

describe("raccourcis clavier", () => {
  it("Cmd+Maj+F change le mode focus", () => {
    expect(key("f", { metaKey: true, shiftKey: true })).toBe("toggle-focus");
    expect(key("F", { metaKey: true, shiftKey: true })).toBe("toggle-focus");
  });

  it("ne réagit pas aux autres touches", () => {
    expect(key("f", { metaKey: true })).toBeNull();
    expect(key("f", { shiftKey: true })).toBeNull();
    expect(key("g", { metaKey: true, shiftKey: true })).toBeNull();
    expect(key("f", { metaKey: true, shiftKey: true, ctrlKey: true })).toBeNull();
  });
});
