import { describe, expect, it } from "vitest";
import { DISPLAY_TOOLS } from "../state/format-bar";
import {
  buildDisplayTools,
  showFocusUnit,
  showFullScreen,
  showOutline,
  showTypewriter,
} from "./editor-tools";

/** Le nom du bouton, et sa bulle d'aide : jamais de texte visible. */
const named = (button: HTMLElement) => [
  button.getAttribute("aria-label"),
  button.title,
  button.textContent,
];

describe("bloc d'outils d'affichage", () => {
  function build() {
    const group = document.createElement("div");
    document.body.append(group);
    buildDisplayTools(group);
    return group;
  }

  it("est un groupe nommé de cinq boutons-icônes, dans l'ordre d'avant", () => {
    const group = build();
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Affichage");
    expect([...group.children].map((button) => button.getAttribute("aria-label"))).toEqual([
      "Focus",
      "Plan",
      "Machine à écrire",
      "Plein écran",
      "Claude",
    ]);
  });

  it("chaque bouton est une icône seule, de type bouton, avec son nom et sa bulle d'aide", () => {
    const group = build();
    const buttons = [...group.querySelectorAll("button")];
    expect(buttons).toHaveLength(DISPLAY_TOOLS.length);
    buttons.forEach((button, index) => {
      expect(button.type).toBe("button");
      expect(button.classList.contains("format-button")).toBe(true);
      expect(button.hasAttribute(`data-${DISPLAY_TOOLS[index]?.key}`)).toBe(true);
      expect(button.textContent).toBe("");
      const icon = button.querySelector("svg") as SVGSVGElement;
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.querySelectorAll("path").length).toBeGreaterThan(0);
    });
    expect(named(buttons[0] as HTMLElement)).toEqual(["Focus", "Focus (Cmd+Maj+F)", ""]);
    expect(named(buttons[1] as HTMLElement)).toEqual(["Plan", "Plan (Cmd+Maj+O)", ""]);
    expect(named(buttons[2] as HTMLElement)[1]).toBe("Machine à écrire (Cmd+Maj+T)");
    expect(named(buttons[3] as HTMLElement)[1]).toBe("Plein écran (Ctrl+Cmd+F)");
    expect(named(buttons[4] as HTMLElement)[1]).toBe("Claude (Ctrl+Cmd+L)");
  });

  it("tous les boutons commencent non actifs, le temps que la fenêtre dise leur état", () => {
    const states = [...build().querySelectorAll("button")].map((b) =>
      b.getAttribute("aria-pressed"),
    );
    expect(states).toEqual(Array(5).fill("false"));
  });

  it("le bouton « Claude » reprend les douze rayons de l'icône de la colonne Claude Code", () => {
    const group = build();
    const claude = group.querySelector("[data-claude] svg") as SVGSVGElement;
    expect(claude.querySelectorAll("path")).toHaveLength(12);
  });
});

describe("bouton du mode focus", () => {
  it("dit le mode en cours dans son nom et sa bulle d'aide, et s'il est actif", () => {
    const button = document.createElement("button");
    showFocusUnit(button, null);
    expect(named(button)).toEqual(["Focus", "Focus (Cmd+Maj+F)", ""]);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    showFocusUnit(button, "sentence");
    expect(named(button)).toEqual(["Focus : phrase", "Focus : phrase (Cmd+Maj+F)", ""]);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    showFocusUnit(button, "paragraph");
    expect(button.getAttribute("aria-label")).toBe("Focus : paragraphe");
  });
});

describe("plein écran", () => {
  it("le bouton propose d'en sortir, avec l'icône qui va avec, sans rien cacher de la fenêtre", () => {
    const button = document.createElement("button");
    showFullScreen(button, false);
    const entering = button.innerHTML;
    showFullScreen(button, true);
    expect(named(button)).toEqual([
      "Quitter le plein écran",
      "Quitter le plein écran (Ctrl+Cmd+F)",
      "",
    ]);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.innerHTML).not.toBe(entering);
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    showFullScreen(button, false);
    expect(named(button)).toEqual(["Plein écran", "Plein écran (Ctrl+Cmd+F)", ""]);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.innerHTML).toBe(entering);
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
