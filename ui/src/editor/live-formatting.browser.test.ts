import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "./editor";

const COLORS = {
  "--marker": "rgb(1, 2, 3)",
  "--code": "rgb(4, 5, 6)",
  "--accent": "rgb(7, 8, 9)",
  "--muted": "rgb(10, 11, 12)",
  "--mono": "Courier",
};

function mount(content: string) {
  for (const [name, value] of Object.entries(COLORS))
    document.documentElement.style.setProperty(name, value);
  const parent = document.createElement("div");
  parent.style.fontSize = "10px";
  document.body.replaceChildren(parent);
  createEditor(parent, () => {}).show(content);
  if (!EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement))
    throw new Error("éditeur introuvable");
  return parent;
}

/** Le style calculé du texte `text`, tel qu'il s'affiche. */
function styleOf(parent: HTMLElement, text: string): CSSStyleDeclaration {
  const span = [...parent.querySelectorAll(".cm-line span")].find((s) => s.textContent === text);
  if (!span) throw new Error(`texte introuvable : ${text}`);
  return getComputedStyle(span);
}

afterEach(() => document.documentElement.removeAttribute("style"));

describe("mise en forme en direct", () => {
  it("donne aux titres une taille décroissante, en gras", () => {
    const parent = mount("# Un\n\n## Deux\n\n### Trois\n\n#### Quatre");
    const sizes = ["Un", "Deux", "Trois"].map((t) => styleOf(parent, t).fontSize);
    expect(sizes).toEqual(["18px", "14.5px", "12px"]);
    expect(["Un", "Deux", "Trois", "Quatre"].map((t) => styleOf(parent, t).fontWeight)).toEqual([
      "700",
      "700",
      "700",
      "700",
    ]);
  });

  it("met le gras, l'italique et le barré", () => {
    const parent = mount("**gras** *italique* ~~barré~~");
    expect(styleOf(parent, "gras").fontWeight).toBe("700");
    expect(styleOf(parent, "italique").fontStyle).toBe("italic");
    expect(styleOf(parent, "barré").textDecorationLine).toBe("line-through");
  });

  it("affiche le code en ligne dans sa police et sa couleur", () => {
    const parent = mount("du `code` ici");
    expect(styleOf(parent, "code").fontFamily).toBe("Courier");
    expect(styleOf(parent, "code").color).toBe("rgb(4, 5, 6)");
  });

  it("colore les liens et souligne les adresses", () => {
    const parent = mount("[site](https://a.fr) et https://b.fr");
    expect(styleOf(parent, "site").color).toBe("rgb(7, 8, 9)");
    expect(styleOf(parent, "https://b.fr").color).toBe("rgb(7, 8, 9)");
    expect(styleOf(parent, "https://b.fr").textDecorationLine).toBe("underline");
  });

  it("affiche une citation en italique et en gris", () => {
    const parent = mount("> pensée");
    expect(styleOf(parent, "pensée").fontStyle).toBe("italic");
    expect(styleOf(parent, "pensée").color).toBe("rgb(10, 11, 12)");
  });

  it("affiche les numéros de liste dans la couleur discrète des marques", () => {
    const parent = mount("1. un");
    expect(styleOf(parent, "1.").color).toBe("rgb(1, 2, 3)");
  });
});
