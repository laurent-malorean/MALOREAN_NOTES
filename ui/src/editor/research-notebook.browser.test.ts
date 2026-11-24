import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor, type EditorOptions } from "./editor";
import "../theme.css";
import "../style.css";
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

  describe("barre d'entrée", () => {
    const ENTRIES =
      "---\ntype: cahier-de-recherche\ntags:\n  - a\n---\n# Levures\n\n## 2026\n\n### Novembre\n\n" +
      "#### Lundi 23\n\n- 09:00 - un\n  suite de un\n\n  paragraphe en retrait\n  - sous-puce\n- 10:00 - deux\n";
    const lines = (parent: HTMLElement) => [...parent.querySelectorAll<HTMLElement>(".cm-line")];
    const line = (parent: HTMLElement, text: string) => {
      const found = lines(parent).find((l) => l.textContent?.includes(text));
      if (!found) throw new Error(`ligne introuvable : ${text}`);
      return found;
    };
    const entry = () => {
      const made = mount();
      made.parent.className = "editor";
      made.editor.show(ENTRIES);
      return made.parent;
    };

    it("pose une barre sur chaque ligne de chaque entrée, et sur rien d'autre", () => {
      const parent = entry();
      const barred = lines(parent)
        .filter((l) => l.classList.contains("entry-bar"))
        .map((l) => l.textContent);
      expect(barred).toEqual([
        "•09:00 - un",
        "  suite de un",
        "",
        "  paragraphe en retrait",
        "  •sous-puce",
        "•10:00 - deux",
      ]);
      const first = lines(parent)
        .filter((l) => l.classList.contains("entry-bar-first"))
        .map((l) => l.textContent);
      expect(first).toEqual(["•09:00 - un", "•10:00 - deux"]);
      expect(line(parent, "tags:").classList.contains("entry-bar")).toBe(false);
      expect(line(parent, "- a").classList.contains("entry-bar")).toBe(false);
    });

    it("dessine la barre à gauche, de la couleur du thème, sur toute la hauteur de l'entrée", () => {
      const parent = entry();
      for (const text of ["09:00 - un", "paragraphe en retrait", "sous-puce", "10:00 - deux"]) {
        const style = getComputedStyle(line(parent, text));
        expect(style.backgroundImage).toContain("gradient");
        expect(style.backgroundRepeat).toBe("no-repeat");
        expect(style.backgroundPositionX).toBe("0%");
        expect(style.backgroundPositionY).toBe("100%");
        expect(parseFloat(style.paddingLeft)).toBeGreaterThan(8);
      }
      const nextLine = getComputedStyle(line(parent, "suite de un"));
      expect(nextLine.backgroundSize).toMatch(/^\d+(\.\d+)?px 100%$/);
    });

    it("sépare nettement deux entrées : leurs barres ne se touchent pas", () => {
      const parent = entry();
      const one = line(parent, "sous-puce").getBoundingClientRect();
      const twoLine = line(parent, "10:00 - deux");
      const two = twoLine.getBoundingClientRect();
      const barStart = two.top + parseFloat(getComputedStyle(twoLine).paddingTop);
      expect(barStart - one.bottom).toBeGreaterThanOrEqual(8);
      const firstOfOne = line(parent, "09:00 - un").getBoundingClientRect();
      const lastOfOne = line(parent, "sous-puce").getBoundingClientRect();
      expect(lastOfOne.bottom).toBeGreaterThan(firstOfOne.bottom + 3 * 10);
    });

    it("n'en met pas dans une note ordinaire", () => {
      const made = mount();
      made.parent.className = "editor";
      made.editor.show("# Note\n\n- un\n- deux\n");
      expect(made.parent.querySelector(".entry-bar")).toBeNull();
    });

    it("suit la version relue du cahier", () => {
      const made = mount();
      made.editor.show(NOTEBOOK);
      expect(made.parent.querySelectorAll(".entry-bar-first").length).toBe(1);
      made.editor.reload(`${NOTEBOOK}- 18:31 - deux\n`);
      expect(made.parent.querySelectorAll(".entry-bar-first").length).toBe(2);
    });
  });
});
