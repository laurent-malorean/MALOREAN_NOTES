import { undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "./editor";

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
