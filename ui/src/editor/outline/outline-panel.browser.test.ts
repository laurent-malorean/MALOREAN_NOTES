import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "../editor";

function mount(content: string) {
  const parent = document.createElement("div");
  const outline = document.createElement("nav");
  document.body.replaceChildren(parent, outline);
  const editor = createEditor(parent, () => {}, { outline });
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  (view.dom as HTMLElement).style.height = "200px";
  return { editor, view, outline };
}

const entries = (outline: HTMLElement) =>
  [...outline.querySelectorAll<HTMLButtonElement>(".outline-item")].map(
    (b) => `${b.className.replace("outline-item outline-level-", "")}:${b.textContent}`,
  );

describe("plan de la note dans la fenêtre", () => {
  it("liste les titres avec leur niveau", () => {
    const { outline } = mount("# Un\ntexte\n## Deux\n### Trois");
    expect(entries(outline)).toEqual(["1:Un", "2:Deux", "3:Trois"]);
    expect(outline.querySelectorAll(".outline-list > li")).toHaveLength(3);
  });

  it("dit qu'il n'y a aucun titre", () => {
    const { outline } = mount("du texte");
    expect(outline.querySelector(".outline-empty")?.textContent).toBe(
      "Aucun titre dans cette note",
    );
    expect(outline.querySelector(".outline-list")).toBeNull();
  });

  it("suit la frappe", () => {
    const { view, outline } = mount("# Un");
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\n## Nouveau" } });
    expect(entries(outline)).toEqual(["1:Un", "2:Nouveau"]);
  });

  it("change avec la note ouverte", () => {
    const { editor, outline } = mount("# Un");
    editor.show("# Autre");
    expect(entries(outline)).toEqual(["1:Autre"]);
  });

  it("un clic emmène au titre, à l'écran, le curseur dessus", async () => {
    const lines = Array.from({ length: 200 }, (_, i) => `ligne ${i}`).join("\n");
    const { view, outline } = mount(`# Début\n${lines}\n## Fin\n${lines}`);
    outline.querySelectorAll<HTMLButtonElement>(".outline-item")[1]?.click();
    const target = view.state.doc.toString().indexOf("## Fin");
    expect(view.state.selection.main.head).toBe(target);
    expect(view.hasFocus).toBe(true);
    // Le titre vient en haut de l'écran, pas seulement juste assez pour être vu.
    await expect
      .poll(() => {
        const line = view.coordsAtPos(target);
        const frame = view.scrollDOM.getBoundingClientRect();
        return line ? (line.top - frame.top) / frame.height : 1;
      })
      .toBeLessThan(0.34);
  });

  it("dessine le plan d'une très longue note une fois son analyse terminée", async () => {
    const lines = Array.from({ length: 60_000 }, (_, i) => `ligne ${i}`).join("\n");
    const { view, outline } = mount(`${lines}\n# Tout au bout`);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
    await expect.poll(() => entries(outline), { timeout: 5000 }).toEqual(["1:Tout au bout"]);
  });
});
