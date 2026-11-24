import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MeaningSearchItem, SearchResultItem } from "../bridge";
import { createLayout, type Layout } from "./layout";
import { connectSearchWindow, renderSearchWindow, type SearchWindowActions } from "./search-window";

function found(path: string, title: string): SearchResultItem {
  return {
    ...{ path, title, folder: "", contentType: "note", container: null },
    ...{ containerTitle: null, node: null, modified: 1 },
    excerpt: [{ text: title, matched: false }],
  };
}

const used = (...titles: string[]): MeaningSearchItem => ({
  results: titles.map((t) => found(`${t}.md`, t)),
  meaning: { kind: "used" },
});

let layout: Layout;
let log: string[];
let actions: SearchWindowActions;

beforeEach(() => {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  layout = createLayout(root);
  log = [];
  actions = {
    open: (path) => void log.push(`ouvrir ${path}`),
    place: (path, placement) => void log.push(`placer ${path} ${placement}`),
    closeNote: (path) => void log.push(`fermer ${path}`),
    closeSearch: () => void log.push("fermer la recherche"),
    openIndexSettings: () => void log.push("réglages Index"),
  };
});

// Le clic en dehors s'écoute sur le document, qui survit à chaque test : une fenêtre fermée l'ignore.
afterEach(() => layout.searchWindow.close());

const titles = (container: HTMLElement) =>
  [...container.querySelectorAll(".note-title")].map((title) => title.textContent);

const draw = (search: Parameters<typeof renderSearchWindow>[2]) =>
  renderSearchWindow(layout, "Notes", search, null, actions);

describe("fenêtre de recherche : les deux colonnes", () => {
  it("a deux colonnes titrées « Recherche match » et « Recherche idées »", () => {
    const headings = [...layout.searchWindow.querySelectorAll(".search-column h2")];
    expect(headings.map((h) => h.textContent)).toEqual(["Recherche match", "Recherche idées"]);
  });

  it("reste fermée sans recherche", () => {
    draw(null);
    expect(layout.searchWindow.open).toBe(false);
  });

  it("s'ouvre avec la recherche et dit qu'elle est en cours dans chaque colonne", () => {
    draw({ query: "pain", results: null });
    expect(layout.searchWindow.open).toBe(true);
    expect(layout.matchResults.textContent).toBe("Recherche…");
    expect(layout.ideasResults.textContent).toBe("Recherche…");
  });

  it("montre les notes des mots à gauche et celles du sens à droite", () => {
    draw({ query: "pain", results: [found("a.md", "Mots")], ideas: used("Sens", "Idée") });
    expect(titles(layout.matchResults)).toEqual(["Mots"]);
    expect(titles(layout.ideasResults)).toEqual(["Sens", "Idée"]);
  });

  it("dit dans chaque colonne qu'aucune note n'est trouvée", () => {
    draw({ query: "pain", results: [], ideas: used() });
    expect(layout.matchResults.textContent).toBe("Aucune note trouvée");
    expect(layout.ideasResults.textContent).toBe("Aucune note trouvée");
  });

  it("marque la note sélectionnée dans les deux colonnes", () => {
    renderSearchWindow(
      layout,
      "Notes",
      { query: "pain", results: [found("a.md", "A")], ideas: used("b") },
      "a.md",
      actions,
    );
    expect(layout.matchResults.querySelector(".selected")).not.toBeNull();
    expect(layout.ideasResults.querySelector(".selected")).toBeNull();
  });

  it("ouvre une note au clic, dans l'une ou l'autre colonne", () => {
    draw({ query: "pain", results: [found("a.md", "A")], ideas: used("b") });
    layout.matchResults.querySelector<HTMLElement>(".search-result")?.click();
    layout.ideasResults.querySelector<HTMLElement>(".search-result")?.click();
    expect(log).toEqual(["ouvrir a.md", "ouvrir b.md"]);
  });

  it("garde la fenêtre ouverte et ne rend pas le focus au champ qui l'avait déjà", () => {
    layout.mainArea.hidden = false;
    layout.searchField.focus();
    draw({ query: "pain", results: null });
    expect(document.activeElement).toBe(layout.searchField);
    draw({ query: "pain", results: [], ideas: used() });
    expect(layout.searchWindow.open).toBe(true);
    expect(document.activeElement).toBe(layout.searchField);
  });

  it("se pose sous le champ de recherche", () => {
    layout.mainArea.hidden = false;
    draw({ query: "pain", results: null });
    const field = layout.searchField.getBoundingClientRect();
    expect(layout.searchWindow.style.top).toBe(`${field.bottom + 24}px`);
  });

  it("descend jusqu'en bas de l'écran, en laissant une marge", () => {
    layout.mainArea.hidden = false;
    draw({ query: "pain", results: null });
    const field = layout.searchField.getBoundingClientRect();
    // La feuille de style n'est pas chargée ici : on lit la hauteur demandée (haut + marge du bas retirés de l'écran).
    const height = layout.searchWindow.style.height;
    expect(height).toContain("100vh");
    expect(height).toContain(`${field.bottom + 24 + 24}px`);
  });

  it("se ferme et se vide quand la recherche s'arrête", () => {
    draw({ query: "pain", results: [found("a.md", "A")], ideas: used("b") });
    draw(null);
    expect(layout.searchWindow.open).toBe(false);
    expect(layout.matchResults.childElementCount).toBe(0);
    expect(layout.ideasResults.childElementCount).toBe(0);
  });
});

describe("fenêtre de recherche : quand le sens manque", () => {
  const missing: MeaningSearchItem = {
    results: [],
    meaning: { kind: "modelMissing", model: "e5-small", message: "Le modèle n'est pas là." },
  };

  it("le dit dans la colonne « idées » et renvoie aux réglages, la colonne « match » répond", () => {
    draw({ query: "pain", results: [found("a.md", "Mots")], ideas: missing });
    expect(titles(layout.matchResults)).toEqual(["Mots"]);
    const notice = layout.ideasResults.querySelector(".search-notice");
    expect(notice?.textContent).toBe("Le modèle n'est pas là.");
    expect(notice?.getAttribute("role")).toBe("note");
    expect(layout.ideasResults.textContent).not.toContain("Aucune note trouvée");
    const button = layout.ideasResults.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toBe("Ouvrir Réglages > Index");
    button?.click();
    expect(log).toEqual(["réglages Index"]);
  });

  it("dit que le calcul n'est pas fini ou qu'il a échoué, sans renvoyer aux réglages", () => {
    const waiting: MeaningSearchItem = {
      results: [],
      meaning: { kind: "notComputed", model: "e5-small", message: "Patientez." },
    };
    draw({ query: "pain", results: [], ideas: waiting });
    expect(layout.ideasResults.textContent).toBe("Patientez.");
    expect(layout.ideasResults.querySelector("button")).toBeNull();
    const failed: MeaningSearchItem = {
      results: [],
      meaning: { kind: "failed", message: "Raté." },
    };
    draw({ query: "pain", results: [], ideas: failed });
    expect(layout.ideasResults.textContent).toBe("Raté.");
    expect(layout.ideasResults.querySelector("button")).toBeNull();
  });
});

describe("fenêtre de recherche : fermeture", () => {
  beforeEach(() => {
    connectSearchWindow(layout, () => log.push("fermer la recherche"));
    draw({ query: "pain", results: [], ideas: used() });
  });

  it("se ferme par la croix", () => {
    layout.searchClose.click();
    expect(log).toEqual(["fermer la recherche"]);
  });

  it("se ferme par Échap dans la fenêtre, pas par une autre touche", () => {
    layout.searchWindow.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(log).toEqual([]);
    layout.searchWindow.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(log).toEqual(["fermer la recherche"]);
  });

  it("se ferme par un clic en dehors, pas dans la fenêtre ni dans le champ", () => {
    const click = (element: Element) =>
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    click(layout.matchResults);
    click(layout.searchField);
    expect(log).toEqual([]);
    click(layout.mainArea);
    expect(log).toEqual(["fermer la recherche"]);
  });

  it("ne se ferme pas par un clic dans un menu contextuel", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.append(menu);
    menu.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(log).toEqual([]);
  });

  it("ne fait rien d'un clic en dehors quand elle est fermée", () => {
    draw(null);
    layout.mainArea.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(log).toEqual([]);
  });
});
