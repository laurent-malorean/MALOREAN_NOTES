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
      layout.windowBar,
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

  it("met l'entrée « Favoris », avec son étoile, juste au-dessus de « Corbeille », du même composant", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    expect(layout.favoritesButton.nextElementSibling).toBe(layout.trashButton);
    expect(layout.favoritesButton.parentElement).toBe(layout.foldersFooter);
    expect(layout.favoritesButton.textContent).toBe("Favoris");
    expect(layout.favoritesButton.className).toContain("trash-item");
    expect(layout.favoritesButton.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
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

  it("une seule bande en haut : la réserve gauche avec le bouton des panneaux, puis les outils, en tête de l'espace de travail", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    expect(root.querySelectorAll(".window-bar")).toHaveLength(1);
    expect(layout.windowBar.className).toBe("window-bar");
    expect(layout.windowBar.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(layout.windowBar.parentElement).toBe(layout.mainArea);
    expect(layout.mainArea.firstElementChild).toBe(layout.windowBar);
    expect([...layout.windowBar.children].map((child) => child.className)).toEqual([
      "window-left",
      "editor-tools",
    ]);
    const left = layout.windowBar.firstElementChild as HTMLElement;
    expect(left.contains(layout.sidePanelsButton)).toBe(true);
    expect(left.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(layout.sidePanelsButton.getAttribute("aria-label")).toBe("Panneaux latéraux");
    // Les outils sont dans la bande, plus dans l'éditeur ; le bouton est dans l'espace de travail, caché avec lui sur l'accueil.
    expect(layout.windowBar.contains(layout.searchField)).toBe(true);
    expect(layout.editor.contains(layout.searchField)).toBe(false);
    expect(layout.editor.querySelector(".editor-tools")).toBeNull();
    expect(layout.mainArea.hidden).toBe(true);
  });

  it("on saisit chaque vide de la bande pour déplacer la fenêtre, jamais un bouton ni le champ ; l'accueil a sa bande de saisie", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    const draggable = [...root.querySelectorAll("[data-tauri-drag-region]")].map(
      (element) => element.className,
    );
    expect(draggable).toEqual([
      "welcome-drag",
      "window-bar",
      "window-left",
      "editor-tools",
      "tool-rows",
      "format-bar",
    ]);
    expect(layout.welcome.firstElementChild?.className).toBe("welcome-drag");
    for (const control of root.querySelectorAll("button, input, select")) {
      expect(control.hasAttribute("data-tauri-drag-region")).toBe(false);
    }
  });

  it("les cinq boutons d'affichage sont des icônes, trouvées par leur nom", () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const layout = createLayout(root);
    const named = [
      [layout.focusButton, "Focus"],
      [layout.outlineButton, "Plan"],
      [layout.typewriterButton, "Machine à écrire"],
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
