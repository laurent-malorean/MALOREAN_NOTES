// Les résultats de la fenêtre de recherche en sections de résultats (fiche 0093), dans le vrai moteur (WebKit).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ContentTypeItem, SearchResultItem } from "../bridge";
import { createLayout, type Layout } from "./layout";
import { renderSearchWindow, type SearchWindowActions } from "./search-window";
import "../theme.css";
import "../style.css";

beforeAll(() => page.viewport(1600, 900));

function found(contentType: ContentTypeItem, path: string): SearchResultItem {
  return {
    ...{ path, title: path, folder: "", contentType, container: null },
    ...{ containerTitle: null, node: null, modified: 1 },
    excerpt: [{ text: `extrait ${path}`, matched: false }],
  };
}

// Dans le désordre, comme la recherche les rend : les notes d'abord.
const mixed = [
  found("note", "n1"),
  found("note", "n2"),
  found("crmAction", "action"),
  found("node", "noeud"),
  found("canvas", "canvas"),
  found("crmPerson", "personne"),
];

let layout: Layout;
let log: string[];
let actions: SearchWindowActions;

beforeEach(() => {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  layout = createLayout(root);
  layout.mainArea.hidden = false;
  log = [];
  actions = {
    open: (path) => void log.push(`ouvrir ${path}`),
    place: () => {},
    closeNote: () => {},
    closeSearch: () => {},
    openIndexSettings: () => {},
  };
});
afterEach(() => layout.searchWindow.close());

const draw = (selected: string | null = null) =>
  renderSearchWindow(
    layout,
    "Notes",
    {
      query: "x",
      results: mixed,
      ideas: { results: [...mixed].reverse(), meaning: { kind: "used" } },
    },
    selected,
    actions,
  );

const titles = (column: HTMLElement) =>
  [...column.querySelectorAll(".search-section-title")].map((title) => title.textContent);
const order = (column: HTMLElement) =>
  [...column.querySelectorAll(".search-result .note-title")].map((title) => title.textContent);
const style = (element: Element) => getComputedStyle(element);

describe("sections de résultats : affichage", () => {
  it("titre chaque section avec son nombre, Notes en dernier, dans la colonne des mots", () => {
    draw();
    expect(titles(layout.matchResults)).toEqual([
      "Canvas (1)",
      "Cartes mentales (1)",
      "CRM (2)",
      "Notes (2)",
    ]);
  });

  it("groupe de même la colonne du sens, quel que soit l'ordre de ses résultats", () => {
    draw();
    expect(titles(layout.ideasResults)).toEqual([
      "Canvas (1)",
      "Cartes mentales (1)",
      "CRM (2)",
      "Notes (2)",
    ]);
  });

  it("garde dans une section l'ordre de la colonne", () => {
    draw();
    expect(order(layout.matchResults)).toEqual([
      "canvas",
      "noeud",
      "action",
      "personne",
      "n1",
      "n2",
    ]);
    expect(order(layout.ideasResults)).toEqual([
      "canvas",
      "noeud",
      "personne",
      "action",
      "n2",
      "n1",
    ]);
  });

  it("n'affiche pas une section sans résultat", () => {
    renderSearchWindow(
      layout,
      "Notes",
      { query: "x", results: [found("note", "n"), found("note", "m")] },
      null,
      actions,
    );
    expect(titles(layout.matchResults)).toEqual(["Notes (2)"]);
  });

  it("donne à chaque section un groupe nommé par son titre, qui contient ses résultats", () => {
    draw();
    const groups = [...layout.matchResults.querySelectorAll('[role="group"]')];
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Canvas (1)",
      "Cartes mentales (1)",
      "CRM (2)",
      "Notes (2)",
    ]);
    expect(groups.map((group) => group.querySelectorAll(".search-result").length)).toEqual([
      1, 1, 2, 2,
    ]);
  });

  it("garde le type écrit à droite de chaque résultat et le dossier", () => {
    draw();
    const types = [...layout.matchResults.querySelectorAll(".search-type")].map(
      (t) => t.textContent,
    );
    expect(types).toEqual(["Canvas", "Nœud", "Action", "Personne", "Note", "Note"]);
  });

  it("marque la note sélectionnée dans sa section", () => {
    draw("action");
    expect(layout.matchResults.querySelector(".selected .note-title")?.textContent).toBe("action");
  });
});

describe("sections de résultats : clavier et clic", () => {
  it("n'a que des résultats pour cibles : un titre n'est ni bouton, ni focalisable", () => {
    draw();
    for (const title of layout.matchResults.querySelectorAll(".search-section-title")) {
      expect(title.closest("button")).toBeNull();
      expect(title.hasAttribute("tabindex")).toBe(false);
    }
    const targets = layout.matchResults.querySelectorAll("button, [tabindex], a[href], input");
    expect(targets.length).toBe(mixed.length);
    for (const target of targets) expect(target.classList.contains("search-result")).toBe(true);
  });

  it("un clic sur un titre n'ouvre rien", () => {
    draw();
    layout.matchResults.querySelector<HTMLElement>(".search-section-title")?.click();
    expect(log).toEqual([]);
  });

  it("Entrée sur un résultat d'une section l'ouvre", async () => {
    draw();
    const nodeResult = [
      ...layout.matchResults.querySelectorAll<HTMLElement>(".search-result"),
    ].find((result) => result.querySelector(".note-title")?.textContent === "noeud");
    nodeResult?.focus();
    await userEvent.keyboard("{Enter}");
    expect(log).toEqual(["ouvrir noeud"]);
  });
});

describe("sections de résultats : espacement (échelle --space-* du thème)", () => {
  it("donne au titre 12 points sur les côtés, 12 au-dessus et 4 au-dessous (--space-3 et --space-1)", () => {
    draw();
    const title = style(layout.matchResults.querySelector(".search-section-title") as Element);
    expect([title.paddingTop, title.paddingLeft, title.paddingRight, title.paddingBottom]).toEqual([
      "12px",
      "12px",
      "12px",
      "4px",
    ]);
  });

  it("sépare deux sections par un filet et 8 points (--space-2), sans filet avant la première", () => {
    draw();
    const [first, second] = [...layout.matchResults.querySelectorAll(".search-section")] as [
      Element,
      Element,
    ];
    expect(style(first).borderTopWidth).toBe("0px");
    expect(style(first).marginTop).toBe("0px");
    expect(style(second).borderTopWidth).toBe("1px");
    expect(style(second).marginTop).toBe("8px");
  });

  it("garde le titre discret : petit, en majuscules, gras, couleur atténuée", () => {
    draw();
    const title = layout.matchResults.querySelector(".search-section-title") as Element;
    const text = style(title);
    expect(text.textTransform).toBe("uppercase");
    expect(text.fontWeight).toBe("600");
    expect(parseFloat(text.fontSize)).toBeLessThan(parseFloat(style(document.body).fontSize));
    const result = layout.matchResults.querySelector(".search-result .search-folder") as Element;
    expect(text.color).toBe(style(result).color);
  });
});
