import { afterEach, describe, expect, it, vi } from "vitest";
import { closeContextMenu, showContextMenu } from "./context-menu";

const menu = () => document.querySelector<HTMLElement>(".context-menu");
const entries = () =>
  [...document.querySelectorAll(".context-menu button")].map((b) => b.textContent);

// Sans la feuille de style de l'application, un menu occuperait toute la largeur de la page.
const style = document.createElement("style");
style.textContent =
  ".context-menu { position: fixed; width: 12rem; display: flex; flex-direction: column; }";
document.head.append(style);

afterEach(() => {
  closeContextMenu();
  document.body.replaceChildren();
});

describe("menu contextuel", () => {
  it("s'ouvre là où l'on a cliqué, avec ses choix", () => {
    showContextMenu(40, 60, [
      { label: "Épingler", run: () => {} },
      { label: "Autre", run: () => {} },
    ]);
    expect(entries()).toEqual(["Épingler", "Autre"]);
    expect(menu()?.style.left).toBe("40px");
    expect(menu()?.style.top).toBe("60px");
    expect(menu()?.getAttribute("role")).toBe("menu");
    const roles = [...document.querySelectorAll(".context-menu button")].map((b) =>
      b.getAttribute("role"),
    );
    expect(roles).toEqual(["menuitem", "menuitem"]);
  });

  it("reste entier dans la fenêtre : un menu ouvert près d'un bord se décale", () => {
    const many = Array.from({ length: 12 }, (_, at) => ({ label: `Choix ${at}`, run: () => {} }));
    showContextMenu(window.innerWidth - 5, window.innerHeight - 5, many);
    const box = (menu() as HTMLElement).getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });

  it("montre une pastille, une coche et un séparateur quand le choix les demande", () => {
    showContextMenu(0, 0, [
      { label: "rouge", swatch: "rouge", checked: true, run: () => {} },
      { label: "Autre", separatorBefore: true, run: () => {} },
    ]);
    const [first, second] = [...document.querySelectorAll<HTMLElement>(".context-menu button")];
    expect(first?.querySelector(".context-menu-swatch")).not.toBeNull();
    expect(first?.getAttribute("aria-checked")).toBe("true");
    expect(first?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(second?.classList.contains("separated")).toBe(true);
    expect(second?.querySelector(".context-menu-swatch")).toBeNull();
  });

  it("montre grisé un choix impossible, et sous les choix une note qui dit pourquoi", () => {
    showContextMenu(
      0,
      0,
      [
        { label: "Corriger", run: () => {}, disabled: true },
        { label: "Autre", run: () => {} },
      ],
      "Apple Intelligence n'est pas activé",
    );
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];
    expect(buttons.map((b) => b.disabled)).toEqual([true, false]);
    const note = document.querySelector(".context-menu .context-menu-note");
    expect(note?.textContent).toBe("Apple Intelligence n'est pas activé");
    expect(menu()?.lastElementChild).toBe(note);
  });

  it("n'a pas de note quand rien n'est à expliquer", () => {
    showContextMenu(0, 0, [{ label: "Épingler", run: () => {} }]);
    expect(document.querySelector(".context-menu-note")).toBeNull();
  });

  it("fait le choix cliqué puis se ferme", () => {
    const chosen: string[] = [];
    showContextMenu(0, 0, [{ label: "Épingler", run: () => chosen.push("épingler") }]);
    document.querySelector<HTMLButtonElement>(".context-menu button")?.click();
    expect(chosen).toEqual(["épingler"]);
    expect(menu()).toBeNull();
  });

  it("se ferme sans rien faire quand on clique ailleurs", () => {
    const chosen: string[] = [];
    showContextMenu(0, 0, [{ label: "Épingler", run: () => chosen.push("épingler") }]);
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu()).toBeNull();
    expect(chosen).toEqual([]);
  });

  it("reste ouvert quand on appuie dans le menu", () => {
    showContextMenu(0, 0, [{ label: "Épingler", run: () => {} }]);
    menu()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu()).not.toBeNull();
  });

  it("se ferme avec Échap, pas avec une autre touche", () => {
    showContextMenu(0, 0, [{ label: "Épingler", run: () => {} }]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(menu()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu()).toBeNull();
  });

  it("n'en montre qu'un à la fois", () => {
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }]);
    showContextMenu(0, 0, [{ label: "Deux", run: () => {} }]);
    expect(document.querySelectorAll(".context-menu")).toHaveLength(1);
    expect(entries()).toEqual(["Deux"]);
  });

  it("cesse d'écouter le clavier et la souris une fois fermé", () => {
    const removed = vi.spyOn(document, "removeEventListener");
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }]);
    closeContextMenu();
    expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(["keydown", "mousedown"]);
    removed.mockRestore();
  });

  it("ne réagit plus une fois fermé", () => {
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }]);
    closeContextMenu();
    closeContextMenu();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu()).toBeNull();
  });
});
