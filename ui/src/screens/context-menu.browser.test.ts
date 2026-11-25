import { afterEach, describe, expect, it, vi } from "vitest";
import { closeContextMenu, contextMenuOpen, showContextMenu } from "./context-menu";

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

  it("un menu ouvert « au-dessus » a son bord bas au point donné, et au moins la largeur demandée", () => {
    showContextMenu(
      40,
      300,
      [
        { label: "Un", run: () => {} },
        { label: "Deux", run: () => {} },
      ],
      undefined,
      { above: true, minWidth: 260 },
    );
    const box = (menu() as HTMLElement).getBoundingClientRect();
    expect(box.bottom).toBe(300);
    expect(box.left).toBe(40);
    expect(box.width).toBeGreaterThanOrEqual(260);
  });

  it("un menu « au-dessus » trop haut pour la fenêtre se cale en haut, entier à l'écran", () => {
    const many = Array.from({ length: 80 }, (_, at) => ({ label: `Choix ${at}`, run: () => {} }));
    showContextMenu(0, 20, many, undefined, { above: true });
    expect((menu() as HTMLElement).getBoundingClientRect().top).toBe(0);
  });

  it("un menu sans option s'ouvre en dessous du point donné", () => {
    showContextMenu(10, 50, [{ label: "Un", run: () => {} }], undefined, {});
    expect((menu() as HTMLElement).getBoundingClientRect().top).toBe(50);
  });

  it("un choix coché avec un nom d'état le dit aux lecteurs d'écran", () => {
    showContextMenu(0, 0, [{ label: "Notes", checked: true, stateName: "ouvert", run: () => {} }]);
    const open = document.querySelector<HTMLElement>(".context-menu button");
    expect(open?.querySelector(".context-menu-check")?.textContent).toBe("✓");
    expect(open?.querySelector(".context-menu-check")?.getAttribute("aria-hidden")).toBe("true");
    expect(open?.querySelector(".context-menu-state")?.textContent).toBe(" ouvert");
    expect(open?.getAttribute("aria-checked")).toBe("true");
    expect(open?.classList.contains("checked")).toBe(false);
  });

  it("les autres choix du menu s'alignent sur le nom, sans coche ni nom d'état", () => {
    showContextMenu(0, 0, [
      { label: "Notes", checked: true, stateName: "ouvert", run: () => {} },
      { label: "Travail", run: () => {} },
      { label: "Ajouter…", separatorBefore: true, run: () => {} },
    ]);
    const [, other, add] = [...document.querySelectorAll<HTMLElement>(".context-menu button")];
    expect(other?.querySelector(".context-menu-check")?.textContent).toBe("");
    expect(other?.querySelector(".context-menu-state")).toBeNull();
    expect(add?.querySelector(".context-menu-check")?.textContent).toBe("");
    expect(add?.classList.contains("separated")).toBe(true);
  });

  it("sans nom d'état, aucune colonne de coche n'est réservée", () => {
    showContextMenu(0, 0, [{ label: "Un", checked: true, run: () => {} }]);
    expect(document.querySelector(".context-menu-check")).toBeNull();
    expect(document.querySelector(".context-menu button")?.classList.contains("checked")).toBe(
      true,
    );
  });

  const key = (name: string) =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: name, cancelable: true }));
  const focused = () => document.activeElement?.textContent;

  it("les flèches parcourent les choix, en boucle, et sautent les choix grisés", () => {
    showContextMenu(0, 0, [
      { label: "Un", run: () => {} },
      { label: "Deux", disabled: true, run: () => {} },
      { label: "Trois", run: () => {} },
    ]);
    key("ArrowDown");
    expect(focused()).toBe("Un");
    key("ArrowDown");
    expect(focused()).toBe("Trois");
    key("ArrowDown");
    expect(focused()).toBe("Un");
    key("ArrowUp");
    expect(focused()).toBe("Trois");
    key("ArrowUp");
    expect(focused()).toBe("Un");
  });

  it("flèche haut sans choix visé : le dernier ; Début et Fin vont aux extrémités", () => {
    showContextMenu(0, 0, [
      { label: "Un", run: () => {} },
      { label: "Deux", run: () => {} },
      { label: "Trois", run: () => {} },
    ]);
    key("ArrowUp");
    expect(focused()).toBe("Trois");
    key("Home");
    expect(focused()).toBe("Un");
    key("End");
    expect(focused()).toBe("Trois");
  });

  it("les flèches ne défilent pas la page ; une autre touche n'y touche pas", () => {
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }]);
    const down = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true });
    document.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const other = new KeyboardEvent("keydown", { key: "a", cancelable: true });
    document.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it("un menu sans choix possible ignore les flèches", () => {
    showContextMenu(0, 0, [{ label: "Un", disabled: true, run: () => {} }]);
    key("ArrowDown");
    expect(menu()).not.toBeNull();
    expect(menu()?.contains(document.activeElement)).toBe(false);
  });

  it("à l'ouverture avec le focus, le choix coché le reçoit ; sinon le premier", () => {
    showContextMenu(
      0,
      0,
      [
        { label: "Un", run: () => {} },
        { label: "Deux", checked: true, run: () => {} },
      ],
      undefined,
      { focus: true },
    );
    expect(focused()).toBe("Deux");
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }], undefined, { focus: true });
    expect(focused()).toBe("Un");
  });

  it("sans l'option, l'ouverture ne prend pas le focus", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }]);
    expect(document.activeElement).toBe(opener);
  });

  it("Entrée sur le choix visé le fait (le bouton reçoit le clic) et ferme le menu", () => {
    const chosen: string[] = [];
    showContextMenu(0, 0, [{ label: "Un", run: () => chosen.push("un") }], undefined, {
      focus: true,
    });
    (document.activeElement as HTMLElement).click();
    expect(chosen).toEqual(["un"]);
    expect(menu()).toBeNull();
  });

  it("fermé avec le focus, le menu le rend au bouton qui l'avait ouvert", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }], undefined, { focus: true });
    expect(document.activeElement).not.toBe(opener);
    key("Escape");
    expect(document.activeElement).toBe(opener);
  });

  it("le bouton désigné comme ouvreur reprend le focus, même s'il ne l'avait pas", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }], undefined, { focus: true, opener });
    key("Escape");
    expect(document.activeElement).toBe(opener);
  });

  it("fermé par un clic ailleurs, le menu ne reprend pas le focus", () => {
    const opener = document.createElement("button");
    const other = document.createElement("input");
    document.body.append(opener, other);
    opener.focus();
    showContextMenu(0, 0, [{ label: "Un", run: () => {} }], undefined, { focus: true });
    other.focus();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.activeElement).toBe(other);
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

  describe("icône et raccourci", () => {
    it("montre l'icône devant le nom et le raccourci après, que la parole ne lit pas", () => {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      showContextMenu(0, 0, [
        { label: "Note", icon, shortcut: "Cmd+N", run: () => {} },
        { label: "Autre", run: () => {} },
      ]);
      const [first, second] = [...document.querySelectorAll<HTMLElement>(".context-menu button")];
      expect(first?.firstElementChild).toBe(icon);
      expect(first?.classList.contains("with-extras")).toBe(true);
      const shortcut = first?.querySelector(".context-menu-shortcut");
      expect(shortcut?.textContent).toBe("Cmd+N");
      expect(shortcut?.getAttribute("aria-hidden")).toBe("true");
      expect(first?.querySelector(".context-menu-label")?.textContent).toBe("Note");
      expect(second?.classList.contains("with-extras")).toBe(false);
      expect(second?.querySelector(".context-menu-shortcut")).toBeNull();
    });
  });

  describe("fermeture", () => {
    it("prévient quand il se ferme : par Échap, par un choix, par un clic ailleurs, par un autre menu", () => {
      const closed: string[] = [];
      const open = (name: string) =>
        showContextMenu(0, 0, [{ label: name, run: () => {} }], undefined, {
          onClose: () => closed.push(name),
        });
      open("a");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      open("b");
      document.querySelector<HTMLButtonElement>(".context-menu button")?.click();
      open("c");
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      open("d");
      open("e");
      closeContextMenu();
      expect(closed).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("dit s'il est ouvert", () => {
      expect(contextMenuOpen()).toBe(false);
      showContextMenu(0, 0, [{ label: "Un", run: () => {} }]);
      expect(contextMenuOpen()).toBe(true);
      closeContextMenu();
      expect(contextMenuOpen()).toBe(false);
    });
  });
});
