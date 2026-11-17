import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "../editor";
import { statusText } from "./status-bar";
import "../../style.css";

function mount(content: string) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {});
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, editor, view };
}

const bar = (parent: HTMLElement) => parent.querySelector<HTMLElement>(".cm-status-bar");

describe("bandeau en bas de la note", () => {
  it("donne les mots, les caractères et les pages de la note, sans sa syntaxe", () => {
    const { parent } = mount("# Courses\n- **pain** frais");
    expect(bar(parent)?.textContent).toBe("3 mots · 17 caractères · 1 page");
    expect(parent.querySelector(".cm-panels-bottom .cm-status-bar")).not.toBeNull();
  });

  it("suit la frappe", () => {
    const { parent, view } = mount("un");
    view.dispatch({ changes: { from: 2, insert: " deux" } });
    expect(bar(parent)?.textContent).toBe("2 mots · 7 caractères · 1 page");
  });

  it("donne les comptes de la sélection quand il y en a une", () => {
    const { parent, view } = mount("un deux trois");
    view.dispatch({ selection: { anchor: 3, head: 13 } });
    expect(bar(parent)?.textContent).toBe("Sélection : 2 mots · 10 caractères · 1 page");
    view.dispatch({ selection: { anchor: 0 } });
    expect(bar(parent)?.textContent).toBe("3 mots · 13 caractères · 1 page");
  });

  it("se met à jour quand on ouvre une autre note", () => {
    const { parent, editor } = mount("un");
    editor.show("un deux trois quatre");
    expect(bar(parent)?.textContent).toBe("4 mots · 20 caractères · 1 page");
  });

  it("compte les pages selon le nombre de caractères réglé, même après avoir changé de note", () => {
    const { parent, editor } = mount("a".repeat(3000));
    expect(bar(parent)?.textContent).toBe("1 mot · 3\u202f000 caractères · 2 pages");
    editor.setCharactersPerPage(1000);
    expect(bar(parent)?.textContent).toBe("1 mot · 3\u202f000 caractères · 3 pages");
    editor.show("a".repeat(500));
    expect(bar(parent)?.textContent).toBe("1 mot · 500 caractères · 1 page");
  });

  it("compte 1 500 caractères par page quand rien n'est réglé", () => {
    expect(statusText(EditorState.create({ doc: "a".repeat(3000) }))).toBe(
      "1 mot · 3\u202f000 caractères · 2 pages",
    );
  });

  it("est annoncé poliment aux lecteurs d'écran", () => {
    const { parent } = mount("un");
    expect(bar(parent)?.getAttribute("aria-live")).toBe("polite");
  });

  it("prend ses couleurs et sa taille dans le thème", () => {
    document.documentElement.style.setProperty("--muted", "rgb(1, 2, 3)");
    document.documentElement.style.setProperty("--status-bar-text-size", "11px");
    const { parent } = mount("un");
    const style = getComputedStyle(bar(parent) as HTMLElement);
    const seen = [style.color, style.fontSize];
    document.documentElement.removeAttribute("style");
    expect(seen).toEqual(["rgb(1, 2, 3)", "11px"]);
  });
});
