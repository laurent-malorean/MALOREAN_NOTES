import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor, type EditorOptions } from "./editor";

/** Un éditeur sur `content`, la sélection de `from` à `to` ; ce qu'il signale et ouvre est noté. */
function mount(content: string, from: number, to = from, options: EditorOptions = {}) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  const changes: string[] = [];
  const editor = createEditor(parent, (text) => changes.push(text), options);
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  view.dispatch({ selection: { anchor: from, head: to } });
  return { editor, view, changes };
}

describe("éditeur : commandes lancées par le menu ou la palette, sans clavier", () => {
  it("met en forme la sélection comme son raccourci, en le signalant", () => {
    const cases = [
      ["bold", "un **mot**"],
      ["italic", "un *mot*"],
      ["insert-link", "un [mot](url)"],
      ["heading-1", "# un mot"],
      ["heading-2", "## un mot"],
      ["heading-3", "### un mot"],
      ["bullet-list", "- un mot"],
      ["numbered-list", "1. un mot"],
    ] as const;
    for (const [command, expected] of cases) {
      const { editor, view, changes } = mount("un mot", 3, 6);
      editor.format(command);
      expect(view.state.doc.toString()).toBe(expected);
      expect(changes).toEqual([expected]);
    }
  });

  it("garde le texte formaté sélectionné, pour enchaîner", () => {
    const { editor, view } = mount("un mot", 3, 6);
    editor.format("bold");
    editor.format("italic");
    expect(view.state.doc.toString()).toBe("un ***mot***");
  });

  it("insère la date du jour à la place de la sélection", () => {
    const today = () => new Date(2026, 10, 19);
    const { editor, view, changes } = mount("le X", 3, 4, { today });
    editor.insertToday();
    expect(view.state.doc.toString()).toBe("le 19 novembre 2026");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(changes).toEqual(["le 19 novembre 2026"]);
  });

  it("ouvre le lien entre notes où se trouve le curseur, sur n'importe quelle ligne", () => {
    const opened: string[] = [];
    // Comme un simple clic : la note se suit dans l'onglet actif, pas dans un nouvel onglet.
    const openLink = (title: string, inNewTab: boolean) =>
      opened.push(inNewTab ? `${title} (nouvel onglet)` : title);
    const { editor } = mount("# Titre\nvoir [[Voyage]] ici", 16, 16, { openLink });
    editor.openLinkAtCursor();
    expect(opened).toEqual(["Voyage"]);
  });

  it("ouvre la cible du lien Markdown où se trouve le curseur", () => {
    const opened: string[] = [];
    const attachmentActions = { attach: async () => null, open: (t: string) => opened.push(t) };
    const { editor } = mount("voir [plan](plan.assets/a.pdf) ici", 7, 7, { attachmentActions });
    editor.openLinkAtCursor();
    expect(opened).toEqual(["plan.assets/a.pdf"]);
  });

  it("un lien entre notes dans le texte d'un lien Markdown : seule la note s'ouvre", () => {
    const opened: string[] = [];
    const openLink = (title: string) => opened.push(title);
    const attachmentActions = { attach: async () => null, open: (t: string) => opened.push(t) };
    const { editor } = mount("[voir [[Voyage]]](a.pdf)", 9, 9, { openLink, attachmentActions });
    editor.openLinkAtCursor();
    expect(opened).toEqual(["Voyage"]);
  });

  it("sans lien sous le curseur, n'ouvre rien", () => {
    const opened: string[] = [];
    const openLink = (title: string) => opened.push(title);
    const open = (target: string) => opened.push(target);
    const attachmentActions = { attach: async () => null, open };
    const options = { openLink, attachmentActions };
    mount("voir [[Voyage]] et [plan](a.pdf)", 2, 2, options).editor.openLinkAtCursor();
    mount("[[Voyage]]", 0, 0, {}).editor.openLinkAtCursor();
    mount("[plan](a.pdf)", 2, 2, {}).editor.openLinkAtCursor();
    expect(opened).toEqual([]);
  });
});
