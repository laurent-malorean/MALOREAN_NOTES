import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor } from "./editor";
import "../theme.css";
import "../style.css";

const EVENT = "---\ntype: agenda-12-evenement\nmois: 10\njour: 5\n---\n# WebSubmit\n\nNotes\n";
const NOTE = "---\ntitle: x\n---\n# Note\n";

function mount() {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const changes: string[] = [];
  const editor = createEditor(parent, (content) => changes.push(content));
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, editor, view, changes };
}

const line = (parent: HTMLElement) =>
  parent.querySelector<HTMLButtonElement>(".agenda-properties") as HTMLButtonElement;

describe("éditeur : l'en-tête technique d'un événement d'un agenda 12", () => {
  it("est replié sur une ligne « Propriétés » : le texte du fichier n'est pas montré mais reste entier", () => {
    const { parent, editor } = mount();
    editor.show(EVENT);
    expect(line(parent).textContent).toBe("▸ Propriétés");
    expect(line(parent).getAttribute("aria-expanded")).toBe("false");
    expect(parent.textContent).not.toContain("agenda-12-evenement");
    expect(parent.textContent).toContain("WebSubmit");
    expect(editor.content()).toBe(EVENT);
  });

  it("un clic le déplie, un second le replie", () => {
    const { parent, editor } = mount();
    editor.show(EVENT);
    line(parent).click();
    expect(line(parent).textContent).toBe("▾ Propriétés");
    expect(line(parent).getAttribute("aria-expanded")).toBe("true");
    expect(parent.textContent).toContain("type: agenda-12-evenement");
    line(parent).click();
    expect(parent.textContent).not.toContain("type: agenda-12-evenement");
  });

  it("déplié, il se modifie comme du texte", () => {
    const { parent, editor, view, changes } = mount();
    editor.show(EVENT);
    line(parent).click();
    view.dispatch({
      changes: {
        from: EVENT.indexOf("jour: 5") + 6,
        to: EVENT.indexOf("jour: 5") + 7,
        insert: "7",
      },
    });
    expect(editor.content()).toContain("jour: 7");
    expect(changes).toHaveLength(1);
  });

  it("replié, il est protégé : une frappe au début de la note tombe sous l'en-tête, un remplacement direct est refusé", async () => {
    const { editor, view } = mount();
    editor.show(EVENT);
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });
    await userEvent.keyboard("abc");
    const header = EVENT.slice(0, EVENT.indexOf("# WebSubmit"));
    expect(editor.content()).toBe(`${header}abc# WebSubmit\n\nNotes\n`);
    view.dispatch({ changes: { from: 0, to: 4, insert: "" } });
    expect(editor.content().startsWith(header)).toBe(true);
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(editor.content().startsWith(header)).toBe(true);
  });

  it("le texte sous l'en-tête s'écrit normalement", () => {
    const { editor, view, changes } = mount();
    editor.show(EVENT);
    view.dispatch({ changes: { from: EVENT.length, insert: "plus" } });
    expect(editor.content()).toBe(`${EVENT}plus`);
    expect(changes).toHaveLength(1);
  });

  it("une version relue sur le disque entre dans l'en-tête replié, qui reste replié", () => {
    const { parent, editor } = mount();
    editor.show(EVENT);
    editor.reload(EVENT.replace("jour: 5", "jour: 6"));
    expect(editor.content()).toContain("jour: 6");
    expect(line(parent).textContent).toBe("▸ Propriétés");
  });

  it("une autre note n'est pas touchée : son en-tête reste visible et modifiable", () => {
    const { parent, editor, view } = mount();
    editor.show(NOTE);
    expect(parent.querySelector(".agenda-properties")).toBeNull();
    expect(parent.textContent).toContain("title: x");
    view.dispatch({ changes: { from: 0, insert: "a" } });
    expect(editor.content()).toBe(`a${NOTE}`);
  });

  it("une note qui cesse d'être un événement perd la ligne, et la retrouve s'il l'est de nouveau", () => {
    const { parent, editor } = mount();
    editor.show(EVENT);
    editor.reload(NOTE);
    expect(parent.querySelector(".agenda-properties")).toBeNull();
    editor.reload(EVENT);
    expect(line(parent)).not.toBeNull();
  });
});
