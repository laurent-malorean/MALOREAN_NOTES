import { describe, expect, it } from "vitest";
import { showFocusUnit } from "./editor-tools";

describe("bouton du mode focus", () => {
  it("dit le mode en cours et s'il est actif", () => {
    const button = document.createElement("button");
    showFocusUnit(button, null);
    expect([button.textContent, button.getAttribute("aria-pressed")]).toEqual(["Focus", "false"]);
    showFocusUnit(button, "sentence");
    expect([button.textContent, button.getAttribute("aria-pressed")]).toEqual([
      "Focus : phrase",
      "true",
    ]);
    showFocusUnit(button, "paragraph");
    expect(button.textContent).toBe("Focus : paragraphe");
  });
});
