import { describe, expect, it } from "vitest";
import type { SearchResultItem } from "../bridge";
import { renderSearchResults } from "./search-results";

const ignore = { open: () => {}, place: () => {}, closeNote: () => {} };

const results: SearchResultItem[] = [
  {
    path: "Travail/Réunions/lundi.md",
    title: "Lundi",
    folder: "Travail/Réunions",
    contentType: "note",
    container: null,
    modified: 2,
    excerpt: [
      { text: "…acheter du ", matched: false },
      { text: "pain", matched: true },
      { text: " <b>frais</b>", matched: false },
    ],
  },
  {
    path: "courses.md",
    title: "Courses",
    folder: "",
    contentType: "note",
    container: null,
    modified: 1,
    excerpt: [{ text: "Pain", matched: true }],
  },
];

function list() {
  const container = document.createElement("nav");
  document.body.replaceChildren(container);
  return container;
}

const texts = (container: HTMLElement, selector: string) =>
  [...container.querySelectorAll(selector)].map((element) => element.textContent);

describe("résultats de recherche", () => {
  it("montre le titre, le dossier et l'extrait de chaque note trouvée", () => {
    const container = list();
    renderSearchResults(container, "Notes", results, null, ignore);
    expect(texts(container, ".note-title")).toEqual(["Lundi", "Courses"]);
    expect(texts(container, ".search-folder")).toEqual(["Travail / Réunions", "Notes"]);
    expect(texts(container, ".search-excerpt")).toEqual(["…acheter du pain <b>frais</b>", "Pain"]);
  });

  it("montre discrètement le type de contenu de chaque note, à côté de son dossier", () => {
    const container = list();
    renderSearchResults(container, "Notes", results, null, ignore);
    expect(texts(container, ".search-place .search-type")).toEqual(["Note", "Note"]);
    expect(texts(container, ".search-place .search-folder")).toEqual([
      "Travail / Réunions",
      "Notes",
    ]);
  });

  it("met en évidence les mots trouvés, et seulement eux", () => {
    const container = list();
    renderSearchResults(container, "Notes", results, null, ignore);
    expect(texts(container, ".search-excerpt mark")).toEqual(["pain", "Pain"]);
  });

  it("ouvre la note sur un clic, dans un nouvel onglet sur un Cmd+clic", () => {
    const container = list();
    const opened: string[] = [];
    renderSearchResults(container, "Notes", results, null, {
      open: (path) => opened.push(`ouvrir ${path}`),
      place: (path, placement) => opened.push(`placer ${path} ${placement}`),
      closeNote: (path) => opened.push(`fermer ${path}`),
    });
    const item = container.querySelectorAll<HTMLElement>(".search-result")[1] as HTMLElement;
    item.click();
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
    expect(opened).toEqual(["ouvrir courses.md", "placer courses.md newTab"]);
  });

  it("le clic droit propose le menu d'une note : l'ouvrir ailleurs sans clavier, ou la fermer", () => {
    const container = list();
    const asked: string[] = [];
    renderSearchResults(container, "Notes", results, null, {
      open: (path) => asked.push(`ouvrir ${path}`),
      place: (path, placement) => asked.push(`placer ${path} ${placement}`),
      closeNote: (path) => asked.push(`fermer ${path}`),
    });
    const item = container.querySelectorAll(".search-result")[1] as Element;
    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    item.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(buttons().map((b) => b.textContent)).toEqual([
      "Ouvrir dans un nouvel onglet",
      "Ouvrir à gauche",
      "Ouvrir à droite",
      "Fermer",
    ]);
    for (const index of [0, 1, 2, 3]) {
      item.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      buttons()[index]?.click();
    }
    expect(asked).toEqual([
      "placer courses.md newTab",
      "placer courses.md left",
      "placer courses.md right",
      "fermer courses.md",
    ]);
  });

  it("marque la note ouverte", () => {
    const container = list();
    renderSearchResults(container, "Notes", results, "courses.md", ignore);
    const marked = [...container.querySelectorAll(".search-result")].map((r) =>
      r.classList.contains("selected"),
    );
    expect(marked).toEqual([false, true]);
  });

  it("dit quand aucune note n'est trouvée", () => {
    const container = list();
    renderSearchResults(container, "Notes", [], null, ignore);
    expect(container.querySelector(".search-message")?.textContent).toBe("Aucune note trouvée");
  });

  it("dit que la recherche est en cours avant la première réponse", () => {
    const container = list();
    renderSearchResults(container, "Notes", null, null, ignore);
    expect(container.querySelector(".search-message")?.textContent).toBe("Recherche…");
  });
});
