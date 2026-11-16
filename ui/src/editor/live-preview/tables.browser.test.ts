import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "../editor";

const TABLE = "| Fruit | Prix |\n|:--|--:|\n| **Pomme** | 2 € |\n| Poire | 3 € |";

function mount(content: string) {
  const parent = document.createElement("div");
  document.body.replaceChildren(parent);
  createEditor(parent, () => {}).show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, view };
}

const cellTexts = (parent: HTMLElement, selector: string) =>
  [...parent.querySelectorAll(`table.cm-lp-table ${selector}`)].map((c) => c.textContent);

describe("aperçu en direct : tableaux", () => {
  it("dessine un tableau à la place de son texte", () => {
    const { parent } = mount(`texte\n\n${TABLE}\n\nfin`);
    expect(cellTexts(parent, "th")).toEqual(["Fruit", "Prix"]);
    expect(cellTexts(parent, "td")).toEqual(["Pomme", "2 €", "Poire", "3 €"]);
    expect(parent.querySelector("table.cm-lp-table td strong")?.textContent).toBe("Pomme");
    expect(parent.querySelector(".cm-content")?.textContent).not.toContain("|");
  });

  it("aligne les colonnes comme demandé", () => {
    const { parent } = mount(`texte\n\n${TABLE}`);
    const aligns = [...parent.querySelectorAll<HTMLElement>("table.cm-lp-table tr:first-child th")];
    expect(aligns.map((c) => c.style.textAlign)).toEqual(["left", "right"]);
  });

  it("montre le texte du tableau quand le curseur y entre", () => {
    const { parent, view } = mount(`texte\n\n${TABLE}`);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(parent.querySelector("table.cm-lp-table")).toBeNull();
    expect(parent.querySelector(".cm-content")?.textContent).toContain("| Poire | 3 € |");
  });

  it("redessine le tableau quand le curseur en sort", () => {
    const { parent, view } = mount(`texte\n\n${TABLE}`);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.dispatch({ selection: { anchor: 0 } });
    expect(parent.querySelector("table.cm-lp-table")).not.toBeNull();
  });

  it("met à jour le tableau quand son texte change", () => {
    const { parent, view } = mount(`texte\n\n${TABLE}`);
    const at = view.state.doc.toString().indexOf("Poire");
    view.dispatch({ changes: { from: at, to: at + 5, insert: "Prune" }, selection: { anchor: 0 } });
    expect(cellTexts(parent, "td")).toContain("Prune");
  });

  it("un clic sur le tableau place le curseur dans son texte pour le modifier", () => {
    const { parent, view } = mount(`texte\n\n${TABLE}`);
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    parent.querySelector("table.cm-lp-table")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.main.head).toBe("texte\n\n".length);
    expect(view.hasFocus).toBe(true);
    expect(parent.querySelector("table.cm-lp-table")).toBeNull();
  });

  it("dessine le tableau sur toute sa largeur, hors des lignes de texte", () => {
    const { parent } = mount(`texte\n\n${TABLE}`);
    expect(parent.querySelector("table.cm-lp-table")?.closest(".cm-line")).toBeNull();
  });

  it("ne redessine pas le tableau quand on tape ailleurs", () => {
    const { parent, view } = mount(`texte\n\n${TABLE}`);
    const before = parent.querySelector("table.cm-lp-table");
    view.dispatch({ changes: { from: 0, insert: "un " }, selection: { anchor: 0 } });
    expect(parent.querySelector("table.cm-lp-table")).toBe(before);
  });

  it("laisse le texte d'un tableau indenté", () => {
    const { parent } = mount(`texte\n\n  ${TABLE.replaceAll("\n", "\n  ")}`);
    expect(parent.querySelector("table.cm-lp-table")).toBeNull();
  });

  it("dessine le tableau d'une très longue note une fois son analyse terminée", async () => {
    const lines = Array.from({ length: 60_000 }, (_, i) => `ligne ${i}`).join("\n");
    const { parent, view } = mount(`${lines}\n\n${TABLE}`);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
    await expect
      .poll(() => parent.querySelector("table.cm-lp-table"), { timeout: 5000 })
      .not.toBeNull();
  });

  it("laisse le texte d'un tableau placé dans une citation", () => {
    const { parent } = mount(`texte\n\n> ${TABLE.replaceAll("\n", "\n> ")}`);
    expect(parent.querySelector("table.cm-lp-table")).toBeNull();
  });

  it("dessine un tableau qui commence la note", () => {
    const { parent, view } = mount(`${TABLE}\n\nfin`);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(parent.querySelector("table.cm-lp-table")).not.toBeNull();
  });
});
