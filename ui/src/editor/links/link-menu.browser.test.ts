import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinkableItem } from "../../bridge";
import { createEditor } from "../editor";
import "../../theme.css";
import "../../style.css";

const item = (title: string, extra: Partial<LinkableItem> = {}): LinkableItem => ({
  path: `${title}.md`,
  title,
  folder: "",
  contentType: "note",
  link: title,
  ...extra,
});

const ITEMS = [
  item("Courses", { folder: "Maison" }),
  item("Plan du projet", { contentType: "canvas", link: "Plan du projet.canvas" }),
  item("Recette de crêpes", { folder: "Cuisine" }),
  item("Réunion lundi"),
];

function mount(content = "", items: readonly LinkableItem[] = ITEMS) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const contents = vi.fn(async () => items);
  const editor = createEditor(parent, () => {}, {
    links: {
      contents,
      row: (found) => ({ label: found.title, detail: found.folder }),
    },
  });
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  view.focus();
  view.dispatch({ selection: { anchor: content.length } });
  return { editor, view, contents };
}

/** Tape `text` à la place du curseur, comme au clavier. */
function type(view: EditorView, text: string) {
  const { head } = view.state.selection.main;
  view.dispatch({
    changes: { from: head, insert: text },
    selection: { anchor: head + text.length },
  });
}

function press(view: EditorView, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const menu = () => document.querySelector<HTMLElement>(".link-menu");
const lines = () =>
  [...document.querySelectorAll(".link-menu-option")].map((line) => line.textContent);
const selected = () =>
  document.querySelector(".link-menu-option[aria-selected=true]")?.textContent ?? null;
const shown = () => vi.waitFor(() => expect(menu()).not.toBeNull());
const text = (view: EditorView) => view.state.doc.toString();

afterEach(() => {
  document.body.replaceChildren();
});

describe("menu des liens : [[ sous le curseur", () => {
  it("s'ouvre sous le curseur avec tout ce qu'on peut lier, le premier choix en avant", async () => {
    const { view } = mount("voir ");
    type(view, "[[");
    await shown();
    expect(lines()).toEqual([
      "CoursesMaison",
      "Plan du projet",
      "Recette de crêpesCuisine",
      "Réunion lundi",
    ]);
    expect(selected()).toBe("CoursesMaison");
    expect(menu()?.querySelector("[role=listbox]")?.getAttribute("aria-label")).toBe(
      "Contenus à lier",
    );
    expect(menu()?.querySelector(".link-menu-title")).toBeNull();
    const caret = view.coordsAtPos(view.state.selection.main.head);
    await vi.waitFor(() =>
      expect(menu()?.getBoundingClientRect().top).toBeGreaterThanOrEqual(caret?.bottom ?? Infinity),
    );
    expect(menu()?.getBoundingClientRect().left).toBeCloseTo(caret?.left ?? Infinity, 0);
  });

  it("filtre à chaque lettre, majuscules et accents ignorés, et remet le premier choix en avant", async () => {
    const { view } = mount();
    type(view, "[[");
    await shown();
    press(view, "ArrowDown");
    expect(selected()).toBe("Plan du projet");
    type(view, "re");
    expect(lines()).toEqual(["Recette de crêpesCuisine", "Réunion lundi"]);
    expect(selected()).toBe("Recette de crêpesCuisine");
    type(view, "u");
    expect(lines()).toEqual(["Réunion lundi"]);
  });

  it("les flèches changent de choix sans sortir de la liste, Entrée écrit le lien à la place de [[ et de ce qui est tapé", async () => {
    const { view } = mount("voir ");
    type(view, "[[re");
    await shown();
    press(view, "ArrowDown");
    press(view, "ArrowDown");
    expect(selected()).toBe("Réunion lundi");
    press(view, "ArrowUp");
    press(view, "ArrowUp");
    press(view, "ArrowUp");
    expect(selected()).toBe("Recette de crêpesCuisine");
    const event = press(view, "ArrowDown");
    expect(event.defaultPrevented).toBe(true);
    press(view, "Enter");
    expect(text(view)).toBe("voir [[Réunion lundi]]");
    expect(view.state.selection.main.head).toBe("voir [[Réunion lundi]]".length);
    expect(menu()).toBeNull();
  });

  it("Tab choisit aussi, un canvas s'écrit avec son extension", async () => {
    const { view } = mount();
    type(view, "[[pla");
    await shown();
    press(view, "Tab");
    expect(text(view)).toBe("[[Plan du projet.canvas]]");
  });

  it("reprend les crochets fermants déjà écrits derrière le curseur", async () => {
    const { view } = mount("[[]] fin");
    view.dispatch({ selection: { anchor: 2 } });
    type(view, "cou");
    await shown();
    press(view, "Enter");
    expect(text(view)).toBe("[[Courses]] fin");
    expect(view.state.selection.main.head).toBe("[[Courses]]".length);
  });

  it("un clic sur une ligne écrit son lien, sans retirer le focus de l'éditeur", async () => {
    const { view } = mount();
    type(view, "[[");
    await shown();
    const line = document.querySelectorAll<HTMLElement>(".link-menu-option")[2] as HTMLElement;
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    line.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    line.click();
    expect(text(view)).toBe("[[Recette de crêpes]]");
    expect(view.hasFocus).toBe(true);
  });

  it("Échap le ferme et il ne se rouvre pas à la lettre suivante ; un nouveau [[ le rouvre", async () => {
    const { view } = mount();
    type(view, "[[co");
    await shown();
    const event = press(view, "Escape");
    expect(event.defaultPrevented).toBe(true);
    expect(menu()).toBeNull();
    type(view, "u");
    expect(menu()).toBeNull();
    type(view, "]] puis [[");
    await vi.waitFor(() => expect(menu()).not.toBeNull());
  });

  it("n'ouvre rien quand rien ne correspond, et revient avec une lettre qui correspond", async () => {
    const { view } = mount();
    type(view, "[[zzz");
    await vi.waitFor(() => expect(view.state.doc.length).toBe(5));
    await Promise.resolve();
    expect(menu()).toBeNull();
    view.dispatch({
      changes: { from: 2, to: 5, insert: "cou" },
      selection: { anchor: 5 },
    });
    expect(lines()).toEqual(["CoursesMaison"]);
  });

  it("se ferme quand le lien est fermé, quand le curseur sort du lien, quand le focus part ou qu'on sélectionne", async () => {
    const { view } = mount("avant ");
    type(view, "[[co");
    await shown();
    type(view, "]]");
    expect(menu()).toBeNull();
    view.dispatch({ changes: { from: 10, to: 12 } });
    await shown();
    view.dispatch({ selection: { anchor: 1 } });
    expect(menu()).toBeNull();
    view.dispatch({ selection: { anchor: 8 } });
    await shown();
    view.dispatch({ selection: { anchor: 4, head: 8 } });
    expect(menu()).toBeNull();
    view.dispatch({ selection: { anchor: 8 } });
    await shown();
    view.contentDOM.blur();
    await vi.waitFor(() => expect(menu()).toBeNull());
  });

  it("laisse Entrée, Tab et les flèches à l'éditeur quand le menu est fermé", () => {
    const { view } = mount("a");
    for (const key of ["Enter", "ArrowDown"]) press(view, key);
    expect(text(view)).toBe("a\n");
  });

  it("demande la liste à chaque ouverture, et ignore celle qui arrive après la fermeture", async () => {
    const { view, contents } = mount();
    type(view, "[[");
    await shown();
    expect(contents).toHaveBeenCalledTimes(1);
    type(view, "c");
    type(view, "o");
    expect(contents).toHaveBeenCalledTimes(1);
    view.dispatch({ selection: { anchor: 0 } });
    expect(menu()).toBeNull();
    view.dispatch({ selection: { anchor: 4 } });
    await shown();
    expect(contents).toHaveBeenCalledTimes(2);
  });

  it("n'ouvre pas le menu d'une ouverture déjà fermée quand sa liste arrive en retard", async () => {
    const { view, contents } = mount();
    let late: (items: LinkableItem[]) => void = () => {};
    contents.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)));
    type(view, "[[");
    view.dispatch({ selection: { anchor: 0 } });
    late(ITEMS);
    await Promise.resolve();
    await Promise.resolve();
    expect(menu()).toBeNull();
  });

  it("disparaît avec l'éditeur", async () => {
    const { view, editor } = mount();
    type(view, "[[");
    await shown();
    editor.destroy();
    expect(menu()).toBeNull();
  });

  it("n'existe pas sans ce qu'on peut lier", () => {
    const parent = document.createElement("div");
    document.body.replaceChildren(parent);
    const editor = createEditor(parent, () => {});
    editor.show("");
    const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
    view?.focus();
    if (view) type(view, "[[");
    expect(menu()).toBeNull();
  });
});

describe("menu des liens : / en début de ligne ou après une espace", () => {
  it("s'ouvre avec le titre « Lien vers… » et seulement des liens", async () => {
    const { view } = mount("voir ");
    type(view, "/");
    await shown();
    expect(menu()?.querySelector(".link-menu-title")?.textContent).toBe("Lien vers…");
    expect(menu()?.querySelector("[role=listbox]")?.getAttribute("aria-label")).toBe("Lien vers…");
    expect(lines()).toHaveLength(ITEMS.length);
    expect(document.querySelectorAll(".link-menu button, .link-menu [role=menuitem]")).toHaveLength(
      0,
    );
  });

  it("filtre ce qui est tapé et écrit le lien à la place de la barre et de ce qui est tapé", async () => {
    const { view } = mount();
    type(view, "/cré");
    await shown();
    expect(lines()).toEqual(["Recette de crêpesCuisine"]);
    press(view, "Enter");
    expect(text(view)).toBe("[[Recette de crêpes]]");
    expect(menu()).toBeNull();
  });

  it("garde ce qui suit le curseur", async () => {
    const { view } = mount("ligne\n suite");
    view.dispatch({ selection: { anchor: 6 } });
    type(view, "/cou");
    await shown();
    press(view, "Enter");
    expect(text(view)).toBe("ligne\n[[Courses]] suite");
  });

  it("ne s'ouvre pas pour une barre collée à un mot ou suivie d'une espace", async () => {
    const { view } = mount("et");
    type(view, "/ou");
    expect(menu()).toBeNull();
    type(view, " / ");
    await Promise.resolve();
    expect(menu()).toBeNull();
  });

  it("Échap ferme le menu de la barre", async () => {
    const { view } = mount();
    type(view, "/c");
    await shown();
    press(view, "Escape");
    expect(menu()).toBeNull();
    expect(text(view)).toBe("/c");
  });
});
