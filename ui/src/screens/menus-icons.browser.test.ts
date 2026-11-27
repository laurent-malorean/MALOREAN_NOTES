// Tous les menus du clic droit de l'application : chaque choix a son icône (ou sa pastille de couleur)
// dans la colonne des icônes, alignée sur celle des autres choix du même menu.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../theme.css";
import "../style.css";
import "./mind-map.css";
import type { SearchResultItem } from "../bridge";
import type { Column } from "../state/columns";
import { PALETTE } from "../state/mind-map";
import {
  alignMenu,
  arrowMenu,
  canvasMenu,
  cardMenu,
  helpMenu,
  senseMenu,
  settingsMenu,
} from "./canvas-menus";
import type { CardMenuKind, MenuActions } from "./canvas-menus";
import { closeContextMenu, type MenuEntry, showContextMenu } from "./context-menu";
import { renderFoldersList } from "./folders-list";
import { nodeMenu } from "./mind-map-menu";
import { noteMenu } from "./note-menu";
import { renderNotesList } from "./notes-list";
import { renderSearchResults } from "./search-results";
import { renderTabs } from "./tabs-view";

afterEach(() => {
  closeContextMenu();
  document.body.replaceChildren();
});

// Des actions qui ne font rien : seuls les menus intéressent ici. Sans `renaming`, le menu s'ouvre tout de suite.
const nothing = new Proxy(
  {},
  { get: (_, key) => (key === "renaming" ? undefined : () => {}) },
) as never;

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];
const nameOf = (button: HTMLElement) =>
  button.querySelector(".context-menu-label")?.textContent ?? "?";

/** Ce que le menu ouvert a de faux : un choix sans icône ni pastille, ou une colonne mal alignée. */
function problems(): string[] {
  const list = buttons();
  const found: string[] = [];
  if (list.length === 0) found.push("menu vide");
  const lefts = new Set<number>();
  const labels = new Set<number>();
  for (const button of list) {
    const column = button.querySelector<HTMLElement>(".context-menu-icon");
    if (column === null) {
      found.push(`${nameOf(button)} : pas de colonne d'icône`);
      continue;
    }
    if (
      column.querySelector("svg") === null &&
      column.querySelector(".context-menu-swatch") === null
    )
      found.push(`${nameOf(button)} : ni icône ni pastille`);
    lefts.add(Math.round(column.getBoundingClientRect().left));
    const label = button.querySelector(".context-menu-label") as HTMLElement;
    labels.add(Math.round(label.getBoundingClientRect().left));
  }
  if (lefts.size > 1) found.push(`colonne des icônes non alignée : ${[...lefts].join(", ")}`);
  if (labels.size > 1) found.push(`noms non alignés : ${[...labels].join(", ")}`);
  return found;
}

const rightClick = (target: Element) =>
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

/** Les menus bâtis à partir d'une liste de choix. */
const FROM_ENTRIES: Record<string, () => readonly MenuEntry[]> = {
  "menu d'une note": () => noteMenu(nothing),
  "canvas : fond": () => canvasMenu(nothing, true),
  "canvas : fond, sans groupe": () => canvasMenu(nothing, false),
  "canvas : ligne": () => arrowMenu(nothing, true),
  "canvas : ligne sans étiquette": () => arrowMenu(nothing, false),
  "canvas : sens de la ligne": () => senseMenu(nothing, "single"),
  "canvas : aligner": () => alignMenu(nothing, 3),
  "canvas : engrenage": () =>
    settingsMenu(nothing, { grid: true, objects: false, readOnly: false }),
  "carte mentale : nœud": () => nodeMenu(nothing, [0], PALETTE[0] ?? null),
  "carte mentale : nœud sans couleur": () => nodeMenu(nothing, [0], null),
};
for (const kind of ["text", "file", "link", "group"] satisfies CardMenuKind[]) {
  FROM_ENTRIES[`canvas : carte ${kind}`] = () => cardMenu(nothing as MenuActions, kind, true);
}

describe("icônes de tous les menus du clic droit", () => {
  for (const [name, entries] of Object.entries(FROM_ENTRIES)) {
    it(`${name} : chaque choix a son icône, alignée`, () => {
      showContextMenu(10, 10, entries());
      expect(problems()).toEqual([]);
    });
  }

  it("le contrôle voit un choix sans icône et un menu vide", () => {
    showContextMenu(10, 10, [
      { label: "Avec", icon: "note", run: () => {} },
      { label: "Sans", run: () => {} },
    ]);
    expect(problems()).toEqual(["Sans : ni icône ni pastille"]);
    closeContextMenu();
    showContextMenu(10, 10, []);
    expect(problems()).toEqual(["menu vide"]);
  });

  it("l'aide du canvas, des lignes de texte grisées, n'a pas d'icône ni de colonne", () => {
    showContextMenu(10, 10, helpMenu());
    expect(buttons().length).toBeGreaterThan(0);
    expect(document.querySelector(".context-menu-icon")).toBeNull();
  });

  it("clic droit sur une note de la liste, épinglée ou non", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const notes = [
      { path: "a.md", title: "A", modified: 0, pinned: true, tags: [] },
      { path: "b.md", title: "B", modified: 0, pinned: false, tags: [] },
    ];
    renderNotesList(container, notes, null, nothing);
    for (const item of container.querySelectorAll(".note-item")) {
      rightClick(item);
      expect(buttons().map(nameOf)).toContain("Placer dans la corbeille");
      expect(problems()).toEqual([]);
    }
  });

  it("clic droit sur la racine et sur un dossier", () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderFoldersList(container, "Notes", ["Plans"], null, nothing, []);
    const [root, folder] = [...container.querySelectorAll(".folder-item")];
    rightClick(root as Element);
    expect(buttons().map(nameOf)).toHaveLength(6);
    expect(problems()).toEqual([]);
    rightClick(folder as Element);
    expect(buttons().map(nameOf)).toHaveLength(7);
    expect(problems()).toEqual([]);
  });

  it("clic droit sur un onglet", () => {
    const list = document.createElement("div");
    document.body.append(list);
    const column: Column = {
      id: 0,
      tabs: [{ id: 1, note: "a.md", title: "A" }],
      activeTab: 1,
      width: 1,
    };
    renderTabs(list, column, nothing);
    rightClick(list.querySelector('[role="tab"]') as Element);
    expect(buttons()).toHaveLength(8);
    expect(problems()).toEqual([]);
  });

  it("clic droit sur une note, un onglet et une note trouvée, avec « Renommer… »", async () => {
    const renaming = { available: async () => true, start: () => {} };
    const renamable = new Proxy(
      {},
      { get: (_, key) => (key === "renaming" ? renaming : () => {}) },
    ) as never;
    const container = document.createElement("div");
    document.body.append(container);
    renderNotesList(
      container,
      [{ path: "a.md", title: "A", modified: 0, pinned: false, tags: [] }],
      null,
      renamable,
    );
    rightClick(container.querySelector(".note-item") as Element);
    await vi.waitFor(() => expect(buttons().map(nameOf)).toContain("Renommer…"));
    expect(problems()).toEqual([]);
    closeContextMenu();
    const list = document.createElement("div");
    document.body.append(list);
    const column: Column = {
      id: 0,
      tabs: [{ id: 1, note: "a.md", title: "A" }],
      activeTab: 1,
      width: 1,
    };
    renderTabs(list, column, renamable);
    rightClick(list.querySelector('[role="tab"]') as Element);
    await vi.waitFor(() => expect(buttons().map(nameOf)).toContain("Renommer…"));
    expect(buttons()).toHaveLength(9);
    expect(problems()).toEqual([]);
  });

  it("clic droit sur une note trouvée par la recherche", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const result: SearchResultItem = {
      path: "a.md",
      title: "A",
      folder: "",
      contentType: "note",
      container: null,
      containerTitle: null,
      node: null,
      modified: 0,
      excerpt: [],
    };
    renderSearchResults(container, "Notes", [result], null, nothing);
    rightClick(container.querySelector(".search-result") as Element);
    expect(buttons()).toHaveLength(4);
    expect(problems()).toEqual([]);
  });
});
