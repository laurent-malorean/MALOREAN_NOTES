import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor, type EditorOptions } from "./editor";
import { isResearchNotebook } from "./research-notebook";

const NOTEBOOK = "---\ntype: cahier-de-recherche\n---\n# Levures\n\n- 18:30 - un\n";

function mount(options: EditorOptions = {}) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const changes: string[] = [];
  const editor = createEditor(parent, (content) => changes.push(content), options);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, editor, view, changes };
}

const of = (text: string) => isResearchNotebook(Text.of(text.split("\n")));

describe("cahier de recherche dans l'éditeur", () => {
  it("reconnaît un cahier à la première clé « type » de son en-tête, comme Rust", () => {
    expect(of(NOTEBOOK)).toBe(true);
    expect(of('---\ntags: [a]\ntype :  "cahier-de-recherche" # c\n---\n# C')).toBe(true);
    expect(of("---\ntype: 'cahier-de-recherche'\n---")).toBe(true);
    expect(of("---\ntype: kanban\ntype: cahier-de-recherche\n---")).toBe(false);
    expect(of("---\n  type: cahier-de-recherche\n---")).toBe(false);
    expect(of("---\ntypes: cahier-de-recherche\n---")).toBe(false);
    expect(of("# Note\ntype: cahier-de-recherche")).toBe(false);
    expect(of("---\ntype: cahier-de-recherche-bis\n---")).toBe(false);
    expect(of("---\ntype: cahier-'de-recherche\n---")).toBe(false);
    expect(of("---\ntype: cahier-de-recherc'he\n---")).toBe(false);
    expect(of("---\ntitle: x\n---")).toBe(false);
  });

  it("ne se modifie pas : ni frappe, ni mise en forme, ni remplacement", async () => {
    const { editor, view, changes } = mount();
    editor.show(NOTEBOOK);
    view.focus();
    view.dispatch({ selection: { anchor: NOTEBOOK.length } });
    await userEvent.keyboard("abc{Enter}");
    editor.format("bold");
    editor.replaceRange(0, 3, "x");
    view.dispatch({ changes: { from: 0, insert: "y" } });
    expect(editor.content()).toBe(NOTEBOOK);
    expect(view.state.readOnly).toBe(true);
    expect(changes).toEqual([]);
  });

  it("une note relue qui devient un cahier passe en lecture seule, avec son « + »", () => {
    const { parent, editor, view } = mount({ addEntry: () => {} });
    editor.show("# Note\n");
    expect(view.state.readOnly).toBe(false);
    editor.reload(NOTEBOOK);
    expect(view.state.readOnly).toBe(true);
    expect(parent.querySelector(".notebook-bar")).not.toBeNull();
  });

  it("montre la version relue sur le disque et la frappe d'une autre colonne", () => {
    const { editor } = mount();
    editor.show(NOTEBOOK);
    const next = `${NOTEBOOK}- 18:31 - deux\n`;
    editor.reload(next);
    expect(editor.content()).toBe(next);
  });

  it("montre en haut un « + » qui ouvre la fenêtre de saisie", () => {
    let asked = 0;
    const { parent, editor } = mount({ addEntry: () => (asked += 1) });
    editor.show(NOTEBOOK);
    expect(parent.querySelector(".cm-panels-top .notebook-bar")).not.toBeNull();
    const add = parent.querySelector<HTMLButtonElement>(".cm-panels-top .notebook-add");
    expect(add?.type).toBe("button");
    expect(add?.textContent).toBe("+");
    expect(add?.title).toBe("Ajouter une entrée");
    expect(add?.getAttribute("aria-label")).toBe("Ajouter une entrée");
    expect(parent.querySelector(".notebook-bar-label")?.textContent).toBe(
      "Cahier de recherche : on n'y fait qu'ajouter",
    );
    add?.click();
    expect(asked).toBe(1);
  });

  it("une note ordinaire se modifie et n'a pas de « + » ; sans action, un cahier non plus", async () => {
    const { parent, editor, view, changes } = mount({ addEntry: () => {} });
    editor.show("# Note\n");
    expect(parent.querySelector(".notebook-bar")).toBeNull();
    view.focus();
    view.dispatch({ selection: { anchor: 7 } });
    await userEvent.keyboard("abc");
    expect(editor.content()).toBe("# Note\nabc");
    expect(changes.length).toBeGreaterThan(0);
    expect(view.state.readOnly).toBe(false);
    const bare = mount();
    bare.editor.show(NOTEBOOK);
    expect(bare.parent.querySelector(".notebook-bar")).toBeNull();
    expect(bare.view.state.readOnly).toBe(true);
  });
});
