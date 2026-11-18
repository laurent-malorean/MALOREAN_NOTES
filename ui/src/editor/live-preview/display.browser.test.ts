// L'aperçu en direct tel qu'on le voit dans la fenêtre : avec le thème et la feuille de style
// de l'application, on mesure ce qui est affiché (boîtes, styles calculés, texte visible).
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createEditor } from "../editor";
import type { ImageResolver } from "./plugin";
import "../../theme.css";
import "../../style.css";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function mount(content: string, resolveImage?: ImageResolver) {
  const parent = document.createElement("div");
  parent.className = "editor";
  parent.style.width = "700px";
  parent.style.height = "600px";
  document.body.replaceChildren(parent);
  createEditor(parent, () => {}, { resolveImage }).show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, view };
}

/** Place le curseur au début de la ligne `n` (comptée à partir de 1), éditeur actif. */
function cursorOnLine(view: EditorView, n: number) {
  view.focus();
  view.dispatch({ selection: { anchor: view.state.doc.line(n).from } });
}

const lines = (parent: HTMLElement) => [...parent.querySelectorAll<HTMLElement>(".cm-line")];

/** Le texte de chaque ligne tel qu'il s'affiche (ce qui est caché n'y est pas). */
// Une ligne vide garde un saut de ligne invisible, que l'on retire.
const shown = (parent: HTMLElement) =>
  lines(parent).map((line) => line.innerText.replace(/\n$/, ""));

/** L'élément qui affiche exactement le texte `text`. */
function spanOf(parent: HTMLElement, text: string): Element {
  const span = [...parent.querySelectorAll(".cm-line span")].find((s) => s.textContent === text);
  if (!span) throw new Error(`texte introuvable : ${text}`);
  return span;
}

/** Un élément se voit : il occupe une place à l'écran et n'est ni masqué ni transparent. */
function isSeen(element: Element | null): boolean {
  if (!element) return false;
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    box.width > 0 &&
    box.height > 0
  );
}

afterEach(() => document.body.replaceChildren());

describe("aperçu à l'écran : marques cachées", () => {
  const NOTE = "# Titre\n\n**gras** et *ital*\n\n> pensée\n\n```js\nlet a = 1;\n```\n\nfin";

  it("n'affiche aucune marque quand l'éditeur n'est pas actif", () => {
    const { parent } = mount(NOTE);
    expect(shown(parent)).toEqual([
      "Titre",
      "",
      "gras et ital",
      "",
      "pensée",
      "",
      "",
      "let a = 1;",
      "",
      "",
      "fin",
    ]);
  });

  it("montre de nouveau les marques de la ligne où se trouve le curseur", () => {
    const { parent, view } = mount(NOTE);
    cursorOnLine(view, 1);
    expect(shown(parent)[0]).toBe("# Titre");
    cursorOnLine(view, 3);
    expect(shown(parent).slice(0, 3)).toEqual(["Titre", "", "**gras** et *ital*"]);
    cursorOnLine(view, 5);
    expect(shown(parent)[4]).toBe("> pensée");
  });

  it("montre les délimiteurs d'un bloc de code quand le curseur entre dans le bloc", () => {
    const { parent, view } = mount(NOTE);
    cursorOnLine(view, 8);
    expect(shown(parent).slice(6, 9)).toEqual(["```js", "let a = 1;", "```"]);
  });

  it("garde le titre à sa taille sans le dièse, en gras", () => {
    const { parent } = mount("# Titre\n\ntexte");
    const [title, , text] = lines(parent);
    expect(getComputedStyle(spanOf(parent, "Titre")).fontWeight).toBe("700");
    expect(title?.getBoundingClientRect().height).toBeGreaterThan(
      text?.getBoundingClientRect().height ?? Infinity,
    );
  });

  it("dessine une citation avec un trait à gauche, décalée du texte", () => {
    const { parent } = mount("texte\n\n> pensée");
    const [text, , quote] = lines(parent);
    expect(Number.parseFloat(getComputedStyle(quote as Element).borderLeftWidth)).toBeGreaterThan(
      0,
    );
    const quoteText = quote?.querySelector("span")?.getBoundingClientRect().left ?? 0;
    expect(quoteText).toBeGreaterThan(text?.getBoundingClientRect().left ?? Infinity);
  });
});

describe("aperçu à l'écran : listes et tâches", () => {
  it("affiche une puce à la place du tiret, devant le texte", () => {
    const { parent } = mount("- pomme");
    const bullet = parent.querySelector(".cm-lp-bullet");
    expect(isSeen(bullet)).toBe(true);
    expect(shown(parent)).toEqual(["•pomme"]);
    const word = lines(parent)[0]?.lastChild;
    const range = document.createRange();
    range.selectNodeContents(word as Node);
    expect(range.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      bullet?.getBoundingClientRect().right ?? Infinity,
    );
  });

  it("affiche une case à cocher visible à la place de « - [ ] »", () => {
    const { parent } = mount("- [ ] lait\n- [x] pain");
    const boxes = [...parent.querySelectorAll<HTMLInputElement>("input.cm-lp-checkbox")];
    expect(boxes.map(isSeen)).toEqual([true, true]);
    expect(boxes.map((box) => box.checked)).toEqual([false, true]);
    expect(shown(parent).map((text) => text.trim())).toEqual(["lait", "pain"]);
  });

  it("coche la tâche dans le texte quand on clique sur sa case", async () => {
    const { parent, view } = mount("- [ ] lait\n- [x] pain");
    await userEvent.click(parent.querySelector("input.cm-lp-checkbox") as Element);
    expect(view.state.doc.toString()).toBe("- [x] lait\n- [x] pain");
    const boxes = [...parent.querySelectorAll<HTMLInputElement>("input.cm-lp-checkbox")];
    expect(boxes.map((box) => box.checked)).toEqual([true, true]);
  });

  it("décoche la tâche dans le texte quand on clique sur une case cochée", async () => {
    const { parent, view } = mount("- [x] pain");
    await userEvent.click(parent.querySelector("input.cm-lp-checkbox") as Element);
    expect(view.state.doc.toString()).toBe("- [ ] pain");
  });
});

describe("aperçu à l'écran : séparateur", () => {
  it("dessine un trait sur toute la largeur du texte à la place de « --- »", () => {
    const { parent } = mount("avant\n\n---\n\naprès");
    const rule = parent.querySelector(".cm-lp-rule");
    const line = rule?.closest(".cm-line");
    expect(shown(parent)[2]).toBe("");
    expect(Number.parseFloat(getComputedStyle(rule as Element).borderTopWidth)).toBeGreaterThan(0);
    expect(rule?.getBoundingClientRect().width).toBeCloseTo(
      line?.getBoundingClientRect().width ?? 0,
      0,
    );
  });
});

describe("aperçu à l'écran : images", () => {
  it("affiche l'image à la place de sa syntaxe, avec son texte de remplacement", async () => {
    const { parent } = mount(`texte\n\n![un point](${PIXEL})`);
    const image = parent.querySelector<HTMLImageElement>("img.cm-lp-image");
    await expect.poll(() => image?.complete && image.naturalWidth).toBe(1);
    expect(isSeen(image)).toBe(true);
    expect(image?.alt).toBe("un point");
    expect(shown(parent)[2]).not.toContain("![");
  });

  it("montre la syntaxe de l'image quand le curseur est sur sa ligne", () => {
    const { parent, view } = mount(`texte\n\n![un point](${PIXEL})`);
    cursorOnLine(view, 3);
    expect(parent.querySelector("img.cm-lp-image")).toBeNull();
    expect(shown(parent)[2]).toBe(`![un point](${PIXEL})`);
  });
});

describe("aperçu à l'écran : tableaux", () => {
  const TABLE = "| Fruit | Prix |\n|:--|--:|\n| Pomme | 2 € |";

  it("dessine un tableau avec ses bordures, sans les barres du texte", () => {
    const { parent } = mount(`texte\n\n${TABLE}\n\nfin`);
    const table = parent.querySelector("table.cm-lp-table");
    expect(isSeen(table)).toBe(true);
    const cells = [...parent.querySelectorAll("table.cm-lp-table td, table.cm-lp-table th")];
    expect(cells.map((cell) => (cell as HTMLElement).innerText)).toEqual([
      "Fruit",
      "Prix",
      "Pomme",
      "2 €",
    ]);
    expect(cells.every((cell) => getComputedStyle(cell).borderTopStyle === "solid")).toBe(true);
    expect(shown(parent).join("\n")).not.toContain("|");
  });

  it("aligne à droite la colonne marquée à droite", () => {
    const { parent } = mount(`texte\n\n${TABLE}`);
    const price = parent.querySelectorAll("table.cm-lp-table td")[1] as Element;
    expect(getComputedStyle(price).textAlign).toBe("right");
  });

  it("redevient du texte modifiable quand on clique dessus", async () => {
    const { parent, view } = mount(`texte\n\n${TABLE}`);
    await userEvent.click(parent.querySelector("table.cm-lp-table") as Element);
    expect(parent.querySelector("table.cm-lp-table")).toBeNull();
    expect(shown(parent).slice(2)).toEqual(TABLE.split("\n"));
    await userEvent.keyboard("X");
    expect(view.state.doc.toString()).toBe(`texte\n\nX${TABLE}`);
  });
});

describe("aperçu à l'écran : blocs de code", () => {
  it("cache les délimiteurs et affiche le code sur fond, en police à chasse fixe", () => {
    const { parent } = mount("texte\n\n```js\nlet a = 1;\n```\n\nfin");
    const [text, , open, code, close] = lines(parent);
    expect([open?.innerText, code?.innerText, close?.innerText]).toEqual(["", "let a = 1;", ""]);
    const style = getComputedStyle(code as Element);
    expect(style.backgroundColor).not.toBe(getComputedStyle(text as Element).backgroundColor);
    expect(style.fontFamily).not.toBe(getComputedStyle(text as Element).fontFamily);
    expect(open?.getBoundingClientRect().height).toBeLessThan(
      code?.getBoundingClientRect().height ?? 0,
    );
  });

  it("colore les mots du code selon leur langue", async () => {
    const { parent } = mount("```js\nlet a = 1;\n```\n\nfin");
    const keyword = () => spanOf(parent, "let");
    await expect.poll(() => keyword().className, { timeout: 10_000 }).not.toBe("");
    const plain = lines(parent)[1] as Element;
    expect(getComputedStyle(keyword()).color).not.toBe(getComputedStyle(plain).color);
  });
});

describe("aperçu à l'écran : liens", () => {
  it("affiche seulement le texte du lien, en couleur", () => {
    const { parent } = mount("voir [le site](https://exemple.fr) ici");
    expect(shown(parent)).toEqual(["voir le site ici"]);
    expect(getComputedStyle(spanOf(parent, "le site")).color).not.toBe(
      getComputedStyle(lines(parent)[0] as Element).color,
    );
  });

  it("montre l'adresse du lien quand le curseur est sur sa ligne", () => {
    const { parent, view } = mount("voir [le site](https://exemple.fr) ici");
    cursorOnLine(view, 1);
    expect(shown(parent)).toEqual(["voir [le site](https://exemple.fr) ici"]);
  });
});
