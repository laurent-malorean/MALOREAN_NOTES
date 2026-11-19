import { undo, undoDepth } from "@codemirror/commands";
import { type ChangeSet, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor, type Editor } from "./editor";

function mount() {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const changes: string[] = [];
  const editor = createEditor(parent, (content) => changes.push(content));
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, editor, view, changes };
}

const visibleText = (parent: HTMLElement) =>
  [...parent.querySelectorAll(".cm-line")]
    .map((line) => (line as HTMLElement).innerText)
    .join("\n");

describe("éditeur : aperçu en direct dans la fenêtre", () => {
  it("affiche la note sans sa syntaxe quand on n'écrit pas", () => {
    const { parent, editor } = mount();
    editor.show("# Titre\n**gras** et *italique*\n> citation");
    expect(visibleText(parent)).toBe("Titre\ngras et italique\ncitation");
  });

  it("montre la syntaxe de la ligne où se trouve le curseur", () => {
    const { parent, editor, view } = mount();
    editor.show("# Titre\n**gras**");
    view.focus();
    view.dispatch({ selection: { anchor: 3 } });
    expect(visibleText(parent).split("\n")[0]).toBe("# Titre");
    expect(visibleText(parent).split("\n")[1]).toBe("gras");
  });

  it("dessine les puces, les cases et les séparateurs", () => {
    const { parent, editor } = mount();
    editor.show("- un\n- [ ] tâche\n\n---");
    expect(parent.querySelectorAll(".cm-lp-bullet")).toHaveLength(1);
    expect(parent.querySelectorAll("input.cm-lp-checkbox")).toHaveLength(1);
    expect(parent.querySelectorAll(".cm-lp-rule")).toHaveLength(1);
  });

  it("coche une tâche d'un clic, dans le texte de la note", () => {
    const { parent, editor, view, changes } = mount();
    editor.show("- [ ] tâche");
    const box = parent.querySelector("input.cm-lp-checkbox") as HTMLInputElement;
    box.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe("- [x] tâche");
    expect(changes).toEqual(["- [x] tâche"]);
  });

  it("signale chaque frappe, mais pas l'ouverture d'une note", () => {
    const { editor, view, changes } = mount();
    editor.show("# Ouverte");
    expect(changes).toEqual([]);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "!" } });
    expect(changes).toEqual(["# Ouverte!"]);
  });

  it("ne garde pas l'historique d'annulation d'une note à l'autre", () => {
    const { editor, view } = mount();
    editor.show("première");
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(undoDepth(view.state)).toBe(1);
    editor.show("seconde");
    expect(undoDepth(view.state)).toBe(0);
    undo(view);
    expect(view.state.doc.toString()).toBe("seconde");
  });

  it("se retire de l'écran quand sa colonne disparaît", () => {
    const { parent, editor } = mount();
    editor.destroy();
    expect(parent.querySelector(".cm-editor")).toBeNull();
  });

  it("donne le focus à l'éditeur", () => {
    const { editor, view } = mount();
    editor.focus();
    expect(view.hasFocus).toBe(true);
  });

  it("garde les mêmes puces et séparateurs quand le curseur se déplace ailleurs", () => {
    const { parent, editor, view } = mount();
    editor.show("- un\n\n---\n\ntexte");
    const bullet = parent.querySelector(".cm-lp-bullet");
    const rule = parent.querySelector(".cm-lp-rule");
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(parent.querySelector(".cm-lp-bullet")).toBe(bullet);
    expect(parent.querySelector(".cm-lp-rule")).toBe(rule);
  });

  it("signale la frappe même avant qu'une note soit ouverte", () => {
    const { view, changes } = mount();
    view.dispatch({ changes: { from: 0, insert: "a" } });
    expect(changes).toEqual(["a"]);
  });

  it("ne signale pas un simple déplacement du curseur", () => {
    const { editor, view, changes } = mount();
    editor.show("abc");
    view.dispatch({ selection: { anchor: 2 } });
    expect(changes).toEqual([]);
  });

  it("indente avec la touche Tab et annule avec Cmd+Z", async () => {
    const { editor, view } = mount();
    editor.show("ligne");
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });
    await userEvent.keyboard("{Tab}");
    expect(view.state.doc.toString()).not.toBe("ligne");
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(view.state.doc.toString()).toBe("ligne");
  });

  it("active le correcteur orthographique en français", () => {
    const { view } = mount();
    expect([
      view.contentDOM.getAttribute("spellcheck"),
      view.contentDOM.getAttribute("lang"),
    ]).toEqual(["true", "fr"]);
  });

  it("invite à écrire un titre dans une note vide", () => {
    const { parent, editor } = mount();
    editor.show("");
    expect(parent.querySelector(".cm-placeholder")?.textContent).toBe("# Titre de la note");
  });

  it("reste fluide sur une très longue note", () => {
    const { parent, editor } = mount();
    const long = Array.from({ length: 3000 }, (_, i) => `## Section ${i}\n**gras** ${i}`).join(
      "\n",
    );
    const start = performance.now();
    editor.show(long);
    expect(performance.now() - start).toBeLessThan(500);
    expect(parent.querySelectorAll(".cm-line").length).toBeLessThan(3000);
  });
});

describe("éditeur : version relue sur le disque", () => {
  it("montre la nouvelle version sans la signaler comme modifiée", () => {
    const { parent, editor, changes } = mount();
    editor.show("# Titre\nancien");
    editor.reload("# Titre\nnouveau");
    expect(visibleText(parent)).toBe("Titre\nnouveau");
    expect(changes).toEqual([]);
  });

  it("garde le curseur à la même ligne et à la même colonne", () => {
    const { editor, view } = mount();
    editor.show("un\ndeux\ntrois");
    view.dispatch({ selection: { anchor: "un\nde".length } });
    editor.reload("UN\nDEUX\nTROIS");
    expect(view.state.selection.main.head).toBe("UN\nDE".length);
  });

  it("ne met pas la relecture dans l'historique d'annulation", () => {
    const { editor, view } = mount();
    editor.show("ancien");
    editor.reload("nouveau");
    expect(undoDepth(view.state)).toBe(0);
    undo(view);
    expect(view.state.doc.toString()).toBe("nouveau");
  });

  it("ne signale pas un simple déplacement du curseur", () => {
    const { editor, view, changes } = mount();
    editor.show("abc");
    view.dispatch({ selection: { anchor: 2 } });
    expect(changes).toEqual([]);
  });

  it("indente avec la touche Tab et annule avec Cmd+Z", async () => {
    const { editor, view } = mount();
    editor.show("ligne");
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });
    await userEvent.keyboard("{Tab}");
    expect(view.state.doc.toString()).not.toBe("ligne");
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(view.state.doc.toString()).toBe("ligne");
  });

  it("active le correcteur orthographique en français", () => {
    const { view } = mount();
    expect([
      view.contentDOM.getAttribute("spellcheck"),
      view.contentDOM.getAttribute("lang"),
    ]).toEqual(["true", "fr"]);
  });

  it("invite à écrire un titre dans une note vide", () => {
    const { parent, editor } = mount();
    editor.show("");
    expect(parent.querySelector(".cm-placeholder")?.textContent).toBe("# Titre de la note");
  });

  it("reste fluide sur une très longue note", () => {
    const { parent, editor } = mount();
    const long = Array.from({ length: 3000 }, (_, i) => `## Section ${i}\n**gras** ${i}`).join(
      "\n",
    );
    const start = performance.now();
    editor.show(long);
    expect(performance.now() - start).toBeLessThan(500);
    expect(parent.querySelectorAll(".cm-line").length).toBeLessThan(3000);
  });
});

describe("éditeur : version relue sur le disque", () => {
  it("montre la nouvelle version sans la signaler comme modifiée", () => {
    const { parent, editor, changes } = mount();
    editor.show("# Titre\nancien");
    editor.reload("# Titre\nnouveau");
    expect(visibleText(parent)).toBe("Titre\nnouveau");
    expect(changes).toEqual([]);
  });

  it("garde le curseur à la même ligne et à la même colonne", () => {
    const { editor, view } = mount();
    editor.show("un\ndeux\ntrois");
    view.dispatch({ selection: { anchor: "un\nde".length } });
    editor.reload("UN\nDEUX\nTROIS");
    expect(view.state.selection.main.head).toBe("UN\nDE".length);
  });

  it("ne met pas la relecture dans l'historique d'annulation", () => {
    const { editor, view } = mount();
    editor.show("ancien");
    editor.reload("nouveau");
    expect(undoDepth(view.state)).toBe(0);
    undo(view);
    expect(view.state.doc.toString()).toBe("nouveau");
  });

  it("signale une frappe arrivée avec un simple déplacement du curseur", () => {
    const { editor, view, changes } = mount();
    editor.show("texte");
    const moved = view.state.update({ selection: { anchor: 1 } });
    const typed = moved.state.update({ changes: { from: 0, insert: "!" } });
    view.dispatch(moved, typed);
    expect(changes).toEqual(["!texte"]);
  });

  it("ne signale pas un simple déplacement du curseur", () => {
    const { editor, view, changes } = mount();
    editor.show("texte");
    view.dispatch({ selection: { anchor: 2 } });
    expect(changes).toEqual([]);
  });

  it("signale encore les frappes qui suivent", () => {
    const { editor, view, changes } = mount();
    editor.show("ancien");
    editor.reload("nouveau");
    view.dispatch({ changes: { from: 0, insert: "!" } });
    expect(changes).toEqual(["!nouveau"]);
  });
});

describe("éditeur : position du texte à l'ouverture d'une note", () => {
  const long = (word: string) => Array.from({ length: 200 }, (_, i) => `${word} ${i}`).join("\n");

  it("montre une autre note depuis son début, même après avoir défilé dans la précédente", async () => {
    const { editor, view } = mount();
    view.dom.style.height = "300px";
    editor.show(long("avant"));
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.line(150).from }, scrollIntoView: true });
    await expect.poll(() => view.scrollDOM.scrollTop).toBeGreaterThan(1000);
    editor.show(long("après"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(view.scrollDOM.scrollTop).toBe(0);
    expect(view.scrollDOM.querySelector(".cm-line")?.textContent).toBe("après 0");
  });
});

describe("éditeur : la même note tapée dans une autre colonne", () => {
  /** Deux éditeurs sur la même note ; ce qui est tapé dans l'un est suivi par l'autre. */
  function mountPair(content: string) {
    const typed: ChangeSet[] = [];
    const parents = [document.createElement("div"), document.createElement("div")];
    document.body.replaceChildren(...parents);
    const [first, second] = parents.map((parent) =>
      createEditor(parent, (text, changes) => typed.push(changes)),
    ) as [Editor, Editor];
    const [one, other] = parents.map((parent) =>
      EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement),
    ) as [EditorView, EditorView];
    first.show(content);
    second.show(content);
    return { first, second, one, other, typed };
  }

  it("signale chaque frappe avec ce qu'elle change, et donne son texte", () => {
    const { first, one, typed } = mountPair("abc");
    one.dispatch({ changes: { from: 1, insert: "X" } });
    expect(typed).toHaveLength(1);
    expect(typed[0]?.apply(Text.of(["abc"])).toString()).toBe("aXbc");
    expect(first.content()).toBe("aXbc");
  });

  it("suit la frappe de l'autre colonne sans la signaler, curseur et sélection gardés", () => {
    const { first, second, one, other, typed } = mountPair("un\ndeux\ntrois");
    other.dispatch({ selection: { anchor: 8, head: 11 } });
    one.dispatch({ changes: { from: 0, insert: "zéro\n" } });
    second.follow(typed[0] as ChangeSet, first.content());
    expect(second.content()).toBe("zéro\nun\ndeux\ntrois");
    expect(
      other.state.sliceDoc(other.state.selection.main.from, other.state.selection.main.to),
    ).toBe("tro");
    expect(typed).toHaveLength(1);
  });

  it("n'annule que ce qui a été tapé chez elle", () => {
    const { first, second, one, other, typed } = mountPair("texte");
    other.dispatch({ changes: { from: 5, insert: " B" } });
    first.follow(typed[0] as ChangeSet, second.content());
    one.dispatch({ changes: { from: 0, insert: "A " } });
    second.follow(typed[1] as ChangeSet, first.content());
    undo(other);
    expect(second.content()).toBe("A texte");
    expect(undoDepth(other.state)).toBe(0);
  });

  it("reprend tout le texte si ce qui change ne correspond plus au sien", () => {
    const { first, second, one, typed } = mountPair("abc");
    second.show("autre chose");
    one.dispatch({ changes: { from: 3, insert: "!" } });
    second.follow(typed[0] as ChangeSet, first.content());
    expect(second.content()).toBe("abc!");
  });

  it("garde son texte à sa place à l'écran quand l'autre écrit au-dessus", async () => {
    const lines = Array.from({ length: 200 }, (_, i) => `ligne ${i}`).join("\n");
    const { first, second, one, other, typed } = mountPair(lines);
    for (const view of [one, other]) view.dom.style.height = "300px";
    other.dispatch({ selection: { anchor: other.state.doc.line(151).from }, scrollIntoView: true });
    await expect.poll(() => other.scrollDOM.scrollTop).toBeGreaterThan(1000);
    const line = () =>
      [...other.dom.querySelectorAll(".cm-line")].find((l) => l.textContent === "ligne 150");
    const before = line()?.getBoundingClientRect().top;
    // Plusieurs frappes avant que l'écran ne soit redessiné, comme sur une machine chargée.
    for (const text of ["nouvelle\n", "lignes\n", "en haut\n"]) {
      one.dispatch({ changes: { from: 0, insert: text } });
      second.follow(typed.at(-1) as ChangeSet, first.content());
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // À une fraction de pixel près : le défilement se fait en pixels entiers.
    expect(Math.abs((line()?.getBoundingClientRect().top ?? 0) - (before ?? 0))).toBeLessThan(1);
    expect(other.state.doc.lineAt(other.state.selection.main.head).text).toBe("ligne 150");
    // Une fois l'écran redessiné, la position à garder est celle où l'on a défilé depuis.
    other.scrollDOM.scrollTop = 0;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    one.dispatch({ changes: { from: one.state.doc.length, insert: "\nfin" } });
    second.follow(typed.at(-1) as ChangeSet, first.content());
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(other.scrollDOM.scrollTop).toBe(0);
  });
});

describe("éditeur : sélection", () => {
  it("rend le texte sélectionné, ou rien sans sélection", () => {
    const { editor, view } = mount();
    editor.show("# Titre\n**gras** et la suite");
    expect(editor.selectedText()).toBe("");
    view.dispatch({ selection: { anchor: 8, head: 16 } });
    expect(editor.selectedText()).toBe("**gras**");
  });

  it("rend les bornes de la sélection, du début à la fin quel que soit le sens", () => {
    const { editor, view } = mount();
    editor.show("# Titre\n**gras** et la suite");
    view.dispatch({ selection: { anchor: 16, head: 8 } });
    expect(editor.selectedRange()).toEqual({ from: 8, to: 16 });
  });

  it("remplace un passage comme une frappe : enregistré, annulable, le curseur après lui", () => {
    const { editor, view, changes } = mount();
    editor.show("Une fote ici.");
    editor.replaceRange(4, 8, "faute");
    expect(editor.content()).toBe("Une faute ici.");
    expect(changes).toEqual(["Une faute ici."]);
    expect(view.state.selection.main.head).toBe(9);
    undo(view);
    expect(editor.content()).toBe("Une fote ici.");
  });

  it("reconnaît ce qui lui appartient à l'écran, et rien d'autre", () => {
    const { parent, editor } = mount();
    editor.show("Texte");
    expect(editor.owns(parent.querySelector(".cm-line"))).toBe(true);
    expect(editor.owns(parent)).toBe(false);
    expect(editor.owns(null)).toBe(false);
  });
});
