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

  describe("clavier", () => {
    const press = (key: string) =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
    const focused = () => document.activeElement?.textContent;
    const three = [
      { label: "Un", run: () => {} },
      { label: "Deux", run: () => {}, disabled: true },
      { label: "Trois", run: () => {} },
    ];

    it("↓ va au premier choix, puis au suivant sans s'arrêter sur un choix grisé, et boucle", () => {
      showContextMenu(0, 0, three);
      press("ArrowDown");
      expect(focused()).toBe("Un");
      press("ArrowDown");
      expect(focused()).toBe("Trois");
      press("ArrowDown");
      expect(focused()).toBe("Un");
    });

    it("↑ va au dernier choix, puis au précédent, et boucle", () => {
      showContextMenu(0, 0, three);
      press("ArrowUp");
      expect(focused()).toBe("Trois");
      press("ArrowUp");
      expect(focused()).toBe("Un");
      press("ArrowUp");
      expect(focused()).toBe("Trois");
    });

    it("les flèches ne défilent pas la page", () => {
      showContextMenu(0, 0, three);
      const down = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true });
      document.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
    });

    it("une autre touche ne déplace pas le choix", () => {
      showContextMenu(0, 0, three);
      press("a");
      expect(document.activeElement).toBe(document.body);
    });

    it("sans choix possible, les flèches ne font rien", () => {
      showContextMenu(0, 0, [{ label: "Un", run: () => {}, disabled: true }]);
      press("ArrowDown");
      expect(menu()).not.toBeNull();
      expect(document.activeElement).toBe(document.body);
    });

    it("`focusFirst` donne le focus au premier choix possible dès l'ouverture", () => {
      showContextMenu(
        0,
        0,
        [{ label: "Un", run: () => {}, disabled: true }, ...three.slice(2)],
        undefined,
        {
          focusFirst: true,
        },
      );
      expect(focused()).toBe("Trois");
    });

    it("sans `focusFirst`, rien n'a le focus à l'ouverture", () => {
      showContextMenu(0, 0, three);
      expect(document.activeElement).toBe(document.body);
    });

    it("Entrée sur le choix qui a le focus le fait", () => {
      const chosen: string[] = [];
      showContextMenu(0, 0, [{ label: "Un", run: () => chosen.push("un") }], undefined, {
        focusFirst: true,
      });
      (document.activeElement as HTMLElement).click();
      expect(chosen).toEqual(["un"]);
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

    it("rend le focus à l'élément demandé quand il l'avait, pas sinon", () => {
      const back = document.createElement("button");
      document.body.append(back);
      const open = (focusFirst: boolean) =>
        showContextMenu(0, 0, [{ label: "Un", run: () => {} }], undefined, {
          focusFirst,
          returnFocusTo: back,
        });
      open(true);
      closeContextMenu();
      expect(document.activeElement).toBe(back);
      back.blur();
      open(false);
      closeContextMenu();
      expect(document.activeElement).not.toBe(back);
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
