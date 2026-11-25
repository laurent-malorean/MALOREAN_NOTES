import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeContextMenu } from "./context-menu";
import { createLayout } from "./layout";
import { connectNewContentMenu } from "./new-content-menu";

const menu = () => document.querySelector<HTMLElement>(".context-menu");
const names = () =>
  [...document.querySelectorAll(".context-menu button")].map((b) => b.textContent);

// Sans la feuille de style de l'application, un menu occuperait toute la largeur de la page.
const style = document.createElement("style");
style.textContent = ".context-menu { position: fixed; display: flex; flex-direction: column; }";
document.head.append(style);

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const layout = createLayout(root);
  // Caché, un bouton ne prend pas le focus.
  layout.mainArea.hidden = false;
  const log: string[] = [];
  connectNewContentMenu(layout, {
    createNote: () => log.push("note"),
    entries: () => [
      { label: "Note", run: () => log.push("choix Note") },
      { label: "Canvas", run: () => log.push("choix Canvas") },
    ],
  });
  return { layout, log, plus: layout.newNoteButton, chevron: layout.newContentButton };
}

const pointer = (target: Element, type: string, button = 0) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, button }));
const mouseClick = (target: HTMLElement) => {
  pointer(target, "pointerdown");
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  pointer(target, "pointerup");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
};
const press = (key: string, target: EventTarget = document) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  closeContextMenu();
  document.body.replaceChildren();
});

describe("menu de création : le chevron", () => {
  it("est un bouton nommé « Nouveau contenu », avec une infobulle et un dessin, à côté du « + »", () => {
    const { plus, chevron } = setup();
    expect(chevron.tagName).toBe("BUTTON");
    expect(chevron.getAttribute("aria-label")).toBe("Nouveau contenu");
    expect(chevron.title).toContain("Nouveau contenu");
    expect(chevron.getAttribute("aria-haspopup")).toBe("menu");
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    expect(chevron.querySelector("svg")).not.toBeNull();
    expect(chevron.previousElementSibling).toBe(plus);
  });

  it("un clic ouvre le menu sous les boutons, sans créer de note ni prendre le focus", () => {
    const { plus, chevron, log } = setup();
    plus.getBoundingClientRect();
    mouseClick(chevron);
    expect(names()).toEqual(["Note", "Canvas"]);
    const box = plus.getBoundingClientRect();
    expect(menu()?.style.left).toBe(`${box.left}px`);
    expect(menu()?.style.top).toBe(`${box.bottom}px`);
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).not.toBeInstanceOf(HTMLButtonElement);
    expect(log).toEqual([]);
  });

  it("un second clic ferme le menu au lieu de le rouvrir", () => {
    const { chevron } = setup();
    mouseClick(chevron);
    mouseClick(chevron);
    expect(menu()).toBeNull();
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    mouseClick(chevron);
    expect(menu()).not.toBeNull();
  });

  it("un clic qui n'a pas commencé sur le chevron ne le ferme pas (appui parti ailleurs)", () => {
    const { chevron } = setup();
    mouseClick(chevron);
    pointer(chevron, "pointerdown");
    pointer(chevron, "pointerleave");
    closeContextMenu();
    chevron.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(menu()).not.toBeNull();
  });

  it("au clavier (Entrée, Espace), l'ouvre avec le focus sur le premier choix ; Échap le ferme et rend le focus", () => {
    const { chevron } = setup();
    chevron.focus();
    chevron.click();
    expect(document.activeElement?.textContent).toBe("Note");
    press("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Canvas");
    press("Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chevron);
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
  });

  it("ouvert à la souris, Échap ne lui donne pas le focus", () => {
    const { chevron } = setup();
    mouseClick(chevron);
    press("Escape");
    expect(document.activeElement).not.toBe(chevron);
  });

  it("↓ sur le chevron ouvre le menu sur le premier choix, une fois seulement", () => {
    const { chevron } = setup();
    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    chevron.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement?.textContent).toBe("Note");
    // Le menu ouvert gère seul la flèche suivante : il n'est pas rouvert sous le focus.
    chevron.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement?.textContent).toBe("Canvas");
  });

  it("une autre touche sur le chevron n'ouvre rien", () => {
    const { chevron } = setup();
    press("a", chevron);
    press("ArrowUp", chevron);
    expect(menu()).toBeNull();
  });

  it("le choix fait ce qu'il dit, ferme le menu, et rien n'est créé de plus", () => {
    const { chevron, log } = setup();
    mouseClick(chevron);
    document.querySelectorAll<HTMLButtonElement>(".context-menu button")[1]?.click();
    expect(log).toEqual(["choix Canvas"]);
    expect(menu()).toBeNull();
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("menu de création : le « + »", () => {
  it("un clic crée une note, sans ouvrir le menu", () => {
    const { plus, log } = setup();
    mouseClick(plus);
    expect(log).toEqual(["note"]);
    expect(menu()).toBeNull();
  });

  it("un appui court (499 ms) puis un clic crée une note, sans menu", () => {
    const { plus, log } = setup();
    pointer(plus, "pointerdown");
    vi.advanceTimersByTime(499);
    pointer(plus, "pointerup");
    plus.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(["note"]);
    expect(menu()).toBeNull();
  });

  it("maintenu 500 ms, ouvre le menu sans créer de note, même au relâchement", () => {
    const { plus, log } = setup();
    pointer(plus, "pointerdown");
    vi.advanceTimersByTime(499);
    expect(menu()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(names()).toEqual(["Note", "Canvas"]);
    pointer(plus, "pointerup");
    plus.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(log).toEqual([]);
    expect(menu()).not.toBeNull();
  });

  it("l'appui prolongé ouvre le menu à la souris : aucun choix n'a le focus", () => {
    const { plus } = setup();
    pointer(plus, "pointerdown");
    vi.advanceTimersByTime(500);
    expect(document.activeElement).not.toBeInstanceOf(HTMLButtonElement);
  });

  it("après un appui prolongé, le clic suivant crée de nouveau une note", () => {
    const { plus, log } = setup();
    pointer(plus, "pointerdown");
    vi.advanceTimersByTime(500);
    pointer(plus, "pointerup");
    plus.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    closeContextMenu();
    mouseClick(plus);
    expect(log).toEqual(["note"]);
  });

  it("l'appui prolongé fini hors du bouton n'avale pas le clic clavier suivant", () => {
    const { plus, log } = setup();
    pointer(plus, "pointerdown");
    vi.advanceTimersByTime(500);
    pointer(plus, "pointerleave");
    plus.click();
    expect(log).toEqual(["note"]);
  });

  it("l'appui quitté avant 500 ms n'ouvre rien", () => {
    const { plus } = setup();
    pointer(plus, "pointerdown");
    vi.advanceTimersByTime(300);
    pointer(plus, "pointerleave");
    vi.advanceTimersByTime(1000);
    expect(menu()).toBeNull();
  });

  it("un appui du bouton droit n'ouvre rien", () => {
    const { plus } = setup();
    pointer(plus, "pointerdown", 2);
    vi.advanceTimersByTime(1000);
    expect(menu()).toBeNull();
  });

  it("l'appui relâché avant 500 ms annule l'ouverture", () => {
    const { plus } = setup();
    pointer(plus, "pointerdown");
    vi.advanceTimersByTime(200);
    pointer(plus, "pointerup");
    vi.advanceTimersByTime(1000);
    expect(menu()).toBeNull();
  });
});
