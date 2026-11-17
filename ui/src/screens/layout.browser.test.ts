import { describe, expect, it } from "vitest";
import { createLayout } from "./layout";

describe("mise en page", () => {
  it("montre l'accueil et cache l'espace de travail au départ", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    expect(layout.welcome.hidden).toBe(false);
    expect(layout.workspace.hidden).toBe(true);
  });

  it("trouve tous les éléments utiles", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    for (const element of [
      layout.libraryName,
      layout.foldersList,
      layout.newFolderButton,
      layout.searchField,
      layout.notesList,
      layout.editor,
      layout.focusButton,
      layout.fullScreenButton,
      layout.sidePanelsButton,
      layout.status,
      layout.newNoteButton,
      layout.settingsButton,
      layout.columns,
      layout.outline,
    ]) {
      expect(element).toBeInstanceOf(HTMLElement);
    }
    expect(layout.chooseButtons).toHaveLength(2);
    expect(layout.settings).toBeInstanceOf(HTMLDialogElement);
    expect(layout.picker).toBeInstanceOf(HTMLDialogElement);
    expect(layout.confirmation).toBeInstanceOf(HTMLDialogElement);
    expect(layout.settings.getAttribute("aria-label")).toBe("Réglages");
    expect(layout.settingsButton.textContent).toBe("Réglages");
    expect(layout.columns.children).toHaveLength(0);
  });
});
