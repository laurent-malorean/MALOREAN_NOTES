import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "./editor";

/** Valeurs de thème reconnaissables : le style doit les reprendre telles quelles. */
const THEME = {
  "--marker": "rgb(1, 2, 3)",
  "--code": "rgb(4, 5, 6)",
  "--accent": "rgb(7, 8, 9)",
  "--muted": "rgb(10, 11, 12)",
  "--mono": "Courier",
  "--heading1-size": "1.8em",
  "--heading2-size": "1.45em",
  "--heading3-size": "1.2em",
  "--syntax-keyword": "rgb(20, 0, 0)",
  "--syntax-string": "rgb(21, 0, 0)",
  "--syntax-comment": "rgb(22, 0, 0)",
  "--syntax-number": "rgb(23, 0, 0)",
  "--syntax-function": "rgb(24, 0, 0)",
  "--syntax-type": "rgb(25, 0, 0)",
  "--syntax-property": "rgb(26, 0, 0)",
  "--syntax-tag": "rgb(27, 0, 0)",
  "--syntax-plain": "rgb(28, 0, 0)",
};

function mount(content: string) {
  for (const [name, value] of Object.entries(THEME))
    document.documentElement.style.setProperty(name, value);
  const parent = document.createElement("div");
  parent.style.fontSize = "10px";
  document.body.replaceChildren(parent);
  createEditor(parent, () => {}).show(content);
  if (!EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement))
    throw new Error("éditeur introuvable");
  return parent;
}

function spanOf(parent: HTMLElement, text: string): Element | undefined {
  return [...parent.querySelectorAll(".cm-line span")].find((s) => s.textContent === text);
}

/** Le style calculé du texte `text`, tel qu'il s'affiche. */
function styleOf(parent: HTMLElement, text: string): CSSStyleDeclaration {
  const span = spanOf(parent, text);
  if (!span) throw new Error(`texte introuvable : ${text}`);
  return getComputedStyle(span);
}

/** Délai pour charger une langue : le tout premier chargement est lent. */
const LANGUAGE_LOADING_MS = 10_000;

/** La couleur du texte `text`, une fois la langue du bloc de code chargée. */
const colorOnceLoaded = (parent: HTMLElement, text: string) =>
  expect.poll(
    () => {
      const span = spanOf(parent, text);
      return span ? getComputedStyle(span).color : null;
    },
    { timeout: LANGUAGE_LOADING_MS },
  );

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

  it("colore un bloc de code selon sa langue, avec les couleurs du thème", async () => {
    const parent = mount(
      [
        "```js",
        "// note",
        'const nom = "Ada";',
        "let n = 42;",
        "class Robot {}",
        "lancer(nom.longueur);",
        "```",
      ].join("\n"),
    );
    await colorOnceLoaded(parent, "const").toBe("rgb(20, 0, 0)");
    await colorOnceLoaded(parent, '"Ada"').toBe("rgb(21, 0, 0)");
    await colorOnceLoaded(parent, "// note").toBe("rgb(22, 0, 0)");
    expect(styleOf(parent, "// note").fontStyle).toBe("italic");
    await colorOnceLoaded(parent, "42").toBe("rgb(23, 0, 0)");
    await colorOnceLoaded(parent, "lancer").toBe("rgb(24, 0, 0)");
    await colorOnceLoaded(parent, "Robot").toBe("rgb(25, 0, 0)");
    await colorOnceLoaded(parent, "longueur").toBe("rgb(26, 0, 0)");
    await colorOnceLoaded(parent, "nom").toBe("rgb(28, 0, 0)");
  });

  it("colore les balises d'un bloc HTML", async () => {
    const parent = mount("```html\n<p>x</p>\n```");
    await colorOnceLoaded(parent, "p").toBe("rgb(27, 0, 0)");
  });
});
