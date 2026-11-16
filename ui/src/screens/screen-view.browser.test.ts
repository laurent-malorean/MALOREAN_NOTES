import { describe, expect, it } from "vitest";
import { libraryOpened, welcome } from "../state/screen";
import { createLayout } from "./layout";
import { renderScreen } from "./screen-view";

function layout() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return createLayout(root);
}

const library = { name: "Notes", path: "/Users/moi/Notes" };

describe("affichage de l'écran", () => {
  it("montre l'accueil et cache l'espace de travail", () => {
    const view = layout();
    renderScreen(view, welcome, () => {});
    expect([view.welcome.hidden, view.workspace.hidden]).toEqual([false, true]);
  });

  it("montre la bibliothèque, son nom et ses notes", () => {
    const view = layout();
    const screen = libraryOpened(library, [{ fileName: "a.md", title: "Alpha", modified: 0 }]);
    renderScreen(view, screen, () => {});
    expect([view.welcome.hidden, view.workspace.hidden]).toEqual([true, false]);
    expect(view.libraryName.textContent).toBe("Notes");
    expect(view.notesList.querySelector(".note-item.selected .note-title")?.textContent).toBe(
      "Alpha",
    );
  });

  it("revient à l'accueil", () => {
    const view = layout();
    renderScreen(view, libraryOpened(library, []), () => {});
    renderScreen(view, welcome, () => {});
    expect([view.welcome.hidden, view.workspace.hidden]).toEqual([false, true]);
  });
});
