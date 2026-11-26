import { describe, expect, it } from "vitest";
import { appIcon } from "./app-icons";
import { buildWindowBar, showSidePanels } from "./window-bar";

function build() {
  const bar = document.createElement("header");
  buildWindowBar(bar);
  return { bar, button: bar.querySelector("button") as HTMLButtonElement };
}

describe("barre de la fenêtre", () => {
  it("se saisit pour déplacer la fenêtre, et ne porte qu'un bouton : celui des panneaux latéraux", () => {
    const { bar } = build();
    expect(bar.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(bar.children).toHaveLength(1);
    expect(bar.querySelectorAll("button")).toHaveLength(1);
  });

  it("le bouton est une icône seule, nommée « Panneaux latéraux », avec le raccourci en bulle d'aide", () => {
    const { button } = build();
    expect(button.type).toBe("button");
    expect(button.hasAttribute("data-side-panels")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Panneaux latéraux");
    expect(button.title).toBe("Panneaux latéraux (Cmd+0)");
    expect(button.textContent).toBe("");
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.hidden).toBe(false);
  });

  it("le bouton dit si les panneaux sont montrés, et son icône change avec l'état ; son nom reste", () => {
    const { button } = build();
    const mainArea = document.createElement("section");
    showSidePanels(mainArea, button, "hidden");
    expect(mainArea.classList.contains("panels-hidden")).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.innerHTML).toBe(appIcon("side-panels-hidden").outerHTML);
    showSidePanels(mainArea, button, "shown");
    expect(mainArea.classList.contains("panels-hidden")).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.innerHTML).toBe(appIcon("side-panels-shown").outerHTML);
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button.getAttribute("aria-label")).toBe("Panneaux latéraux");
    expect(button.title).toBe("Panneaux latéraux (Cmd+0)");
  });
});
