import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor, type EditorOptions } from "./editor";
import { entryDayLabel, isResearchNotebook } from "./research-notebook";

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

  it("une note relue qui devient un cahier passe en lecture seule, avec sa zone de saisie", () => {
    const { parent, editor, view } = mount({ addEntry: async () => true });
    editor.show("# Note\n");
    expect(view.state.readOnly).toBe(false);
    editor.reload(NOTEBOOK);
    expect(view.state.readOnly).toBe(true);
    expect(parent.querySelector(".notebook-entry")).not.toBeNull();
  });

  it("montre la version relue sur le disque et la frappe d'une autre colonne", () => {
    const { editor } = mount();
    editor.show(NOTEBOOK);
    const next = `${NOTEBOOK}- 18:31 - deux\n`;
    editor.reload(next);
    expect(editor.content()).toBe(next);
  });

  it("donne le jour sous lequel l'entrée sera rangée, en toutes lettres", () => {
    expect(entryDayLabel(new Date(2026, 10, 23, 9, 42))).toBe("Lundi 23 novembre");
    expect(entryDayLabel(new Date(2026, 11, 1))).toBe("Mardi 1er décembre");
  });

  it("montre en bas, sous le texte, une zone de saisie de 8 lignes et un seul bouton", () => {
    const { parent, editor } = mount({
      addEntry: async () => true,
      today: () => new Date(2026, 10, 23),
    });
    editor.show(NOTEBOOK);
    const area = parent.querySelector(".cm-panels-bottom .notebook-entry");
    expect(area).not.toBeNull();
    expect(parent.querySelector(".cm-panels-top")).toBeNull();
    const text = area?.querySelector("textarea");
    expect(text?.rows).toBe(8);
    expect(text?.getAttribute("aria-label")).toBe("Nouvelle entrée");
    expect(area?.querySelector(".notebook-entry-message")?.textContent).toBe(
      "Nouvelle entrée — elle sera datée au moment de l'ajout et rangée sous « Lundi 23 novembre »",
    );
    expect(area?.textContent).toContain("Le reste du cahier est en lecture seule.");
    const buttons = [...(area?.querySelectorAll("button") ?? [])];
    expect(buttons.map((b) => [b.type, b.textContent])).toEqual([["button", "Ajouter l'entrée"]]);
  });

  it("ajoute le texte saisi, puis vide la zone ; si l'ajout échoue, le texte reste", async () => {
    const asked: string[] = [];
    let succeed = false;
    const { parent, editor } = mount({
      addEntry: async (text) => (asked.push(text), succeed),
    });
    editor.show(NOTEBOOK);
    const text = parent.querySelector("textarea") as HTMLTextAreaElement;
    const add = parent.querySelector(".notebook-entry button") as HTMLButtonElement;
    await userEvent.click(text);
    await userEvent.keyboard("un{Enter}deux");
    expect(text.value).toBe("un\ndeux");
    add.click();
    await expect.poll(() => add.disabled).toBe(false);
    expect(asked).toEqual(["un\ndeux"]);
    expect(text.value).toBe("un\ndeux");
    succeed = true;
    add.click();
    expect(add.disabled).toBe(true);
    await expect.poll(() => text.value).toBe("");
    expect(asked).toEqual(["un\ndeux", "un\ndeux"]);
    expect(add.disabled).toBe(false);
  });

  it("une note ordinaire se modifie et n'a pas de zone de saisie ; sans action, un cahier non plus", async () => {
    const { parent, editor, view, changes } = mount({ addEntry: async () => true });
    editor.show("# Note\n");
    expect(parent.querySelector(".notebook-entry")).toBeNull();
    view.focus();
    view.dispatch({ selection: { anchor: 7 } });
    await userEvent.keyboard("abc");
    expect(editor.content()).toBe("# Note\nabc");
    expect(changes.length).toBeGreaterThan(0);
    expect(view.state.readOnly).toBe(false);
    const bare = mount();
    bare.editor.show(NOTEBOOK);
    expect(bare.parent.querySelector(".notebook-entry")).toBeNull();
    expect(bare.view.state.readOnly).toBe(true);
  });
});
