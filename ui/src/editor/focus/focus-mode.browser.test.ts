import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "../editor";

function mount(content: string) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {});
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, view, editor };
}

const dimmedText = (parent: HTMLElement) =>
  [...parent.querySelectorAll(".cm-focus-dimmed")].map((e) => e.textContent).join("|");

describe("mode focus", () => {
  it("n'estompe rien tant qu'il est arrêté", () => {
    const { parent } = mount("Un. Deux.");
    expect(parent.querySelector(".cm-focus-dimmed")).toBeNull();
  });

  it("estompe tout sauf la phrase du curseur", () => {
    const { parent, view, editor } = mount("Un. Deux. Trois.");
    view.dispatch({ selection: { anchor: 6 } });
    editor.setFocusMode("sentence");
    expect(dimmedText(parent)).toBe("Un. | Trois.");
  });

  it("estompe tout sauf le paragraphe du curseur", () => {
    const { parent, view, editor } = mount("Un.\n\nDeux. Trois.");
    editor.setFocusMode("paragraph");
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(dimmedText(parent)).toBe("Un.");
  });

  it("suit le curseur", () => {
    const { parent, view, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(dimmedText(parent)).toBe("Un. ");
  });

  it("estompe aussi le texte tapé hors de la phrase en cours", () => {
    const { parent, view, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    view.dispatch({ changes: { from: view.state.doc.length, insert: " Trois." } });
    expect(dimmedText(parent)).toBe(" Deux. Trois.");
  });

  it("n'estompe rien quand le passage est toute la note", () => {
    const { parent, editor } = mount("Une seule phrase.");
    editor.setFocusMode("sentence");
    expect(parent.querySelector(".cm-focus-dimmed")).toBeNull();
  });

  it("s'arrête quand on le demande", () => {
    const { parent, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    editor.setFocusMode(null);
    expect(parent.querySelector(".cm-focus-dimmed")).toBeNull();
  });

  it("reste actif quand on ouvre une autre note", () => {
    const { parent, editor } = mount("Un. Deux.");
    editor.setFocusMode("sentence");
    editor.show("Trois. Quatre.");
    expect(dimmedText(parent)).toBe(" Quatre.");
  });
});
