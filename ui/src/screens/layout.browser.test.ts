import { describe, expect, it } from "vitest";
import { createLayout } from "./layout";

describe("mise en page", () => {
  it("montre l'accueil et cache l'espace de travail au départ", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    expect(layout.welcome.hidden).toBe(false);
    expect(layout.mainArea.hidden).toBe(true);
  });

  it("trouve tous les éléments utiles", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    for (const element of [
      layout.workspaceSwitcher,
      layout.listHeading,
      layout.addButton,
      layout.switchButton,
      layout.foldersList,
      layout.tagsList,
      layout.tagFilter,
      layout.newFolderButton,
      layout.searchField,
      layout.notesList,
      layout.editor,
      layout.focusButton,
      layout.fullScreenButton,
      layout.sidePanelsButton,
      layout.claudeButton,
      layout.claudeColumn,
      layout.status,
      layout.newNoteButton,
      layout.settingsButton,
      layout.columns,
      layout.outline,
    ]) {
      expect(element).toBeInstanceOf(HTMLElement);
    }
    expect(layout.addButton.textContent).toBe("Choisir un dossier de notes");
    expect(layout.switchButton.textContent).toBe("Changer d'espace de travail");
    expect(layout.workspaceSwitcher.getAttribute("aria-haspopup")).toBe("menu");
    expect(layout.settings).toBeInstanceOf(HTMLDialogElement);
    expect(layout.picker).toBeInstanceOf(HTMLDialogElement);
    expect(layout.confirmation).toBeInstanceOf(HTMLDialogElement);
    expect(layout.printSheet.className).toBe("print-sheet");
    expect(layout.settings.getAttribute("aria-label")).toBe("Réglages");
    expect(layout.settingsButton.textContent).toBe("Réglages");
    expect(layout.columns.children).toHaveLength(0);
    expect(layout.tagFilter.hidden).toBe(true);
    expect(layout.tagsList.hidden).toBe(true);
    expect(layout.tagsList.getAttribute("aria-label")).toBe("Étiquettes");
    expect(layout.claudeColumn.hidden).toBe(true);
    expect(layout.claudeColumn.getAttribute("aria-label")).toBe("Claude Code");
    expect(layout.claudeButton.getAttribute("aria-pressed")).toBe("false");
  });
});
