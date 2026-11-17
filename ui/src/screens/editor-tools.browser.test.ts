import { describe, expect, it } from "vitest";
import { showFocusUnit, showFullScreen, showTypewriter } from "./editor-tools";

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

describe("plein écran", () => {
  it("ne laisse que le texte, et le bouton propose d'en sortir", () => {
    const workspace = document.createElement("section");
    const button = document.createElement("button");
    showFullScreen(workspace, button, true);
    expect(workspace.classList.contains("full-screen")).toBe(true);
    expect([button.textContent, button.getAttribute("aria-pressed")]).toEqual([
      "Quitter le plein écran",
      "true",
    ]);
    showFullScreen(workspace, button, false);
    expect(workspace.classList.contains("full-screen")).toBe(false);
    expect([button.textContent, button.getAttribute("aria-pressed")]).toEqual([
      "Plein écran",
      "false",
    ]);
  });
});

describe("bouton du mode machine à écrire", () => {
  it("dit si le mode est en marche", () => {
    const button = document.createElement("button");
    showTypewriter(button, "on");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    showTypewriter(button, "off");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});
