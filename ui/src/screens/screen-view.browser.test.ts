import { describe, expect, it } from "vitest";
import {
  folderSelected,
  libraryOpened,
  searchAnswered,
  searchTyped,
  welcome,
} from "../state/screen";
import { createLayout } from "./layout";
import { renderScreen, type ScreenActions } from "./screen-view";

const ignore: ScreenActions = {
  open: () => {},
  select: () => {},
  create: () => {},
  rename: () => {},
  move: () => {},
  moveNote: () => {},
};

function layout() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return createLayout(root);
}

const library = { name: "Notes", path: "/Users/moi/Notes" };

describe("affichage de l'écran", () => {
  it("montre l'accueil et cache l'espace de travail", () => {
    const view = layout();
    renderScreen(view, welcome, ignore);
    expect([view.welcome.hidden, view.workspace.hidden]).toEqual([false, true]);
  });

  it("montre la bibliothèque, son nom et ses notes", () => {
    const view = layout();
    const screen = libraryOpened(
      library,
      ["Travail"],
      [{ path: "a.md", title: "Alpha", modified: 0 }],
    );
    renderScreen(view, screen, ignore);
    expect([view.welcome.hidden, view.workspace.hidden]).toEqual([true, false]);
    expect(view.libraryName.textContent).toBe("Notes");
    expect(view.notesList.querySelector(".note-item.selected .note-title")?.textContent).toBe(
      "Alpha",
    );
  });

  it("montre la colonne des dossiers et le nom du dossier affiché", () => {
    const view = layout();
    const opened = libraryOpened(
      library,
      ["Travail", "Travail/Réunions", "Travail/Réunions/2026"],
      [],
    );
    renderScreen(view, opened, ignore);
    expect(view.foldersList.querySelectorAll(".folder-item")).toHaveLength(4);
    renderScreen(view, folderSelected(opened, "Travail/Réunions/2026", []), ignore);
    expect(view.libraryName.textContent).toBe("2026");
    expect(view.foldersList.querySelector(".folder-item.selected")?.textContent).toBe("2026");
  });

  it("ouvre la note cliquée et choisit le dossier cliqué", () => {
    const view = layout();
    const calls: string[] = [];
    const actions = {
      ...ignore,
      open: (p: string) => calls.push(`note ${p}`),
      select: (p: string) => calls.push(`dossier ${p}`),
    };
    renderScreen(
      view,
      libraryOpened(library, ["Travail"], [{ path: "a.md", title: "A", modified: 0 }]),
      actions,
    );
    view.notesList.querySelector<HTMLElement>(".note-item")?.click();
    view.foldersList.querySelector<HTMLElement>('[data-path="Travail"]')?.click();
    expect(calls).toEqual(["note a.md", "dossier Travail"]);
  });

  it("montre les notes trouvées à la place de la liste pendant une recherche", () => {
    const view = layout();
    const opened = libraryOpened(library, [], [{ path: "a.md", title: "Alpha", modified: 0 }]);
    const result = { path: "b.md", title: "Bêta", folder: "", modified: 0, excerpt: [] };
    const calls: string[] = [];
    const searching = searchAnswered(searchTyped(opened, "pain"), "pain", [result]);
    renderScreen(view, searching, { ...ignore, open: (p) => calls.push(p) });
    expect(view.notesList.querySelector(".note-item")).toBeNull();
    view.notesList.querySelector<HTMLElement>(".search-result")?.click();
    expect(calls).toEqual(["b.md"]);
    expect(view.searchField.value).toBe("pain");
  });

  it("vide le champ de recherche quand la recherche s'arrête", () => {
    const view = layout();
    const opened = libraryOpened(library, ["Travail"], []);
    renderScreen(view, searchTyped(opened, "pain"), ignore);
    renderScreen(view, folderSelected(searchTyped(opened, "pain"), "Travail", []), ignore);
    expect(view.searchField.value).toBe("");
  });

  it("ne touche pas au champ pendant qu'on tape", () => {
    const view = layout();
    view.searchField.value = "pain";
    view.searchField.setSelectionRange(1, 1);
    renderScreen(view, searchTyped(libraryOpened(library, [], []), "pain"), ignore);
    expect(view.searchField.selectionStart).toBe(1);
  });

  it("revient à l'accueil", () => {
    const view = layout();
    renderScreen(view, libraryOpened(library, [], []), ignore);
    renderScreen(view, welcome, ignore);
    expect([view.welcome.hidden, view.workspace.hidden]).toEqual([false, true]);
  });
});
