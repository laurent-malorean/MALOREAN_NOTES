import { describe, expect, it } from "vitest";
import {
  showFocusUnit,
  showFullScreen,
  showOutline,
  showSidePanels,
  showTypewriter,
} from "./editor-tools";

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
  it("le bouton propose d'en sortir, sans rien cacher de la fenêtre", () => {
    const button = document.createElement("button");
    showFullScreen(button, true);
    expect([button.textContent, button.getAttribute("aria-pressed")]).toEqual([
      "Quitter le plein écran",
      "true",
    ]);
    showFullScreen(button, false);
    expect([button.textContent, button.getAttribute("aria-pressed")]).toEqual([
      "Plein écran",
      "false",
    ]);
  });
});

describe("panneaux latéraux", () => {
  it("se cachent ensemble, et le bouton dit s'ils sont montrés", () => {
    const mainArea = document.createElement("section");
    const button = document.createElement("button");
    showSidePanels(mainArea, button, "hidden");
    expect(mainArea.classList.contains("panels-hidden")).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    showSidePanels(mainArea, button, "shown");
    expect(mainArea.classList.contains("panels-hidden")).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("true");
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

describe("plan de la note", () => {
  it("se montre à droite du texte, qui lui laisse la place, puis se cache", () => {
    const area = document.createElement("main");
    const outline = document.createElement("nav");
    const button = document.createElement("button");
    showOutline(area, outline, button, "shown");
    expect([outline.hidden, area.classList.contains("outline-open")]).toEqual([false, true]);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    showOutline(area, outline, button, "hidden");
    expect([outline.hidden, area.classList.contains("outline-open")]).toEqual([true, false]);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
});
