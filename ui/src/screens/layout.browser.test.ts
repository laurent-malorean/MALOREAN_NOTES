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
      layout.workspaceBar,
      layout.workspaceBarName,
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
    expect(layout.workspaceSwitcher.getAttribute("aria-haspopup")).toBe("menu");
    expect(layout.workspaceBar.getAttribute("aria-haspopup")).toBe("menu");
    expect(layout.workspaceBar.contains(layout.workspaceBarName)).toBe(true);
    expect(layout.workspaceBar.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(root.textContent).not.toContain("Changer d'espace de travail");
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

  it("pose les trois blocs d'icônes puis le champ de recherche sur la bande du haut", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    expect(layout.formatBar.className).toBe("format-bar");
    const rows = layout.formatBar.parentElement as HTMLElement;
    expect(rows.className).toBe("tool-rows");
    expect(rows.parentElement?.className).toBe("editor-tools");
    expect([...rows.children].map((child) => child.className)).toEqual([
      "format-bar",
      "display-tools format-group",
      "search-field",
    ]);
    expect(rows.lastElementChild).toBe(layout.searchField);
    const displayTools = layout.focusButton.parentElement as HTMLElement;
    expect(displayTools.className).toBe("display-tools format-group");
    expect(displayTools.firstElementChild).toBe(layout.focusButton);
  });

  it("les six boutons d'affichage sont des icônes, trouvées par leur nom", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    const named = [
      [layout.focusButton, "Focus"],
      [layout.outlineButton, "Plan"],
      [layout.typewriterButton, "Machine à écrire"],
      [layout.sidePanelsButton, "Panneaux"],
      [layout.fullScreenButton, "Plein écran"],
      [layout.claudeButton, "Claude"],
    ] as const;
    for (const [button, name] of named) {
      expect(button.getAttribute("aria-label")).toBe(name);
      expect(button.textContent).toBe("");
      expect(button.querySelector("svg")).not.toBeNull();
    }
  });
});
