import { describe, expect, it } from "vitest";
import type { MeaningSearchItem, SearchResultItem } from "../bridge";
import {
  folderSelected,
  ideasAnswered,
  workspaceOpened,
  recentShown,
  searchAnswered,
  searchTyped,
  tagSelected,
  tagsRefreshed,
  trashShown,
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
  pin: () => {},
  unpin: () => {},
  trash: () => {},
  place: () => {},
  closeNote: () => {},
  exportNote: () => {},
  printNote: () => {},
  copyNote: () => {},
  copyMarkdown: () => {},
  showHistory: () => {},
  trashFolder: () => {},
  fold: () => {},
  newNote: () => {},
  newMindMap: () => {},
  newNotebook: () => {},
  restoreNote: () => {},
  restoreFolder: () => {},
  empty: () => {},
  selectTag: () => {},
  clearTag: () => {},
  sortNotes: () => {},
  showRecent: () => {},
  closeSearch: () => {},
  openIndexSettings: () => {},
};

function layout() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return createLayout(root);
}

const workspace = { name: "Notes", path: "/Users/moi/Notes" };

describe("affichage de l'écran", () => {
  it("montre l'accueil et cache l'espace de travail", () => {
    const view = layout();
    renderScreen(view, welcome, ignore);
    expect([view.welcome.hidden, view.mainArea.hidden]).toEqual([false, true]);
  });

  it("montre l'espace de travail, son nom et ses notes", () => {
    const view = layout();
    const screen = workspaceOpened(
      workspace,
      ["Travail"],
      [{ path: "a.md", title: "Alpha", modified: 0, pinned: false, tags: [] }],
    );
    renderScreen(view, screen, ignore);
    expect([view.welcome.hidden, view.mainArea.hidden]).toEqual([true, false]);
    expect(view.workspaceSwitcher.textContent).toBe("Notes");
    expect(view.listHeading.textContent).toBe("Notes");
    expect(view.notesList.querySelector(".note-item.selected .note-title")?.textContent).toBe(
      "Alpha",
    );
  });

  it("le sélecteur montre le nom de l'espace de travail, même sur un dossier ou une étiquette", () => {
    const view = layout();
    const opened = workspaceOpened({ name: "Perso", path: "/p" }, ["2026"], []);
    renderScreen(view, folderSelected(opened, "2026", []), ignore);
    expect(view.workspaceSwitcher.textContent).toBe("Perso");
    expect(view.listHeading.textContent).toBe("2026");
  });

  it("montre le tri de la liste et en demande un autre ; la corbeille n'en a pas", () => {
    const view = layout();
    const asked: string[] = [];
    const note = {
      path: "a.md",
      title: "A",
      modified: 0,
      pinned: false,
      tags: [],
    };
    const sorted = workspaceOpened(workspace, [], [note], [], "title");
    renderScreen(view, sorted, { ...ignore, sortNotes: (order) => asked.push(order) });
    expect(view.noteOrder.value).toBe("title");
    view.noteOrder.value = "modified";
    view.noteOrder.dispatchEvent(new Event("change"));
    expect(asked).toEqual(["modified"]);
    renderScreen(view, trashShown(sorted, { folders: [], notes: [] }), ignore);
    expect(view.noteOrder.parentElement?.hidden).toBe(true);
  });

  it("montre la liste des dossiers et le nom du dossier affiché", () => {
    const view = layout();
    const opened = workspaceOpened(
      workspace,
      ["Travail", "Travail/Réunions", "Travail/Réunions/2026"],
      [],
    );
    renderScreen(view, opened, ignore);
    expect(view.foldersList.querySelectorAll(".folder-item")).toHaveLength(4);
    renderScreen(view, folderSelected(opened, "Travail/Réunions/2026", []), ignore);
    expect(view.listHeading.textContent).toBe("2026");
    expect(view.foldersList.querySelector(".folder-item.selected")?.textContent).toBe("2026");
  });

  it("cache les sous-dossiers des dossiers pliés", () => {
    const view = layout();
    renderScreen(
      view,
      workspaceOpened(workspace, ["Travail", "Travail/Réunions"], [], ["Travail"]),
      ignore,
    );
    expect(view.foldersList.querySelectorAll(".folder-item")).toHaveLength(2);
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
      workspaceOpened(
        workspace,
        ["Travail"],
        [{ path: "a.md", title: "A", modified: 0, pinned: false, tags: [] }],
      ),
      actions,
    );
    view.notesList.querySelector<HTMLElement>(".note-item")?.click();
    view.foldersList.querySelector<HTMLElement>('[data-path="Travail"]')?.click();
    expect(calls).toEqual(["note a.md", "dossier Travail"]);
  });

  it("montre les notes trouvées dans la fenêtre de recherche, sans toucher à la liste des notes", () => {
    const view = layout();
    const opened = workspaceOpened(
      workspace,
      [],
      [{ path: "a.md", title: "Alpha", modified: 0, pinned: false, tags: [] }],
    );
    const result: SearchResultItem = {
      path: "b.md",
      title: "Bêta",
      folder: "",
      contentType: "note",
      container: null,
      containerTitle: null,
      node: null,
      modified: 0,
      excerpt: [],
    };
    const calls: string[] = [];
    const searching = searchAnswered(searchTyped(opened, "pain"), "pain", [result]);
    renderScreen(view, searching, { ...ignore, open: (p) => calls.push(p) });
    expect(view.searchWindow.open).toBe(true);
    expect(view.notesList.querySelector(".search-result")).toBeNull();
    expect(view.notesList.querySelector(".note-item")?.textContent).toContain("Alpha");
    view.matchResults.querySelector<HTMLElement>(".search-result")?.click();
    expect(calls).toEqual(["b.md"]);
    expect(view.searchField.value).toBe("pain");
    renderScreen(view, folderSelected(opened, "", []), ignore);
    expect(view.searchWindow.open).toBe(false);
  });

  it("montre dans la colonne « idées » la réponse de la recherche par le sens", () => {
    const view = layout();
    const opened = workspaceOpened(workspace, [], []);
    const failed: MeaningSearchItem = {
      results: [],
      meaning: { kind: "failed", message: "Le calcul a échoué." },
    };
    const searching = ideasAnswered(searchTyped(opened, "pain"), "pain", failed);
    renderScreen(view, searching, ignore);
    expect(view.ideasResults.querySelector(".search-notice")?.textContent).toBe(
      "Le calcul a échoué.",
    );
    expect(view.matchResults.textContent).toBe("Recherche…");
  });

  it("sous le seuil de recherche, garde le texte et montre les notes du dossier", () => {
    const view = layout();
    const opened = workspaceOpened(
      workspace,
      [],
      [{ path: "a.md", title: "Alpha", modified: 0, pinned: false, tags: [] }],
    );
    renderScreen(view, searchTyped(opened, "pa"), ignore);
    expect(view.searchField.value).toBe("pa");
    expect(view.searchWindow.open).toBe(false);
    expect(view.notesList.querySelector(".note-item")?.textContent).toContain("Alpha");
  });

  it("vide le champ de recherche quand la recherche s'arrête", () => {
    const view = layout();
    const opened = workspaceOpened(workspace, ["Travail"], []);
    renderScreen(view, searchTyped(opened, "pain"), ignore);
    renderScreen(view, folderSelected(searchTyped(opened, "pain"), "Travail", []), ignore);
    expect(view.searchField.value).toBe("");
  });

  it("ne touche pas au champ pendant qu'on tape", () => {
    const view = layout();
    view.searchField.value = "pain";
    view.searchField.setSelectionRange(1, 1);
    renderScreen(view, searchTyped(workspaceOpened(workspace, [], []), "pain"), ignore);
    expect(view.searchField.selectionStart).toBe(1);
  });

  it("revient à l'accueil", () => {
    const view = layout();
    renderScreen(view, workspaceOpened(workspace, [], []), ignore);
    renderScreen(view, welcome, ignore);
    expect([view.welcome.hidden, view.mainArea.hidden]).toEqual([false, true]);
  });
});

describe("affichage de la corbeille", () => {
  it("montre la corbeille à la place des notes, et elle seule en évidence", () => {
    const view = layout();
    const opened = workspaceOpened(
      workspace,
      ["Travail"],
      [{ path: "a.md", title: "Alpha", modified: 0, pinned: false, tags: [] }],
    );
    const screen = trashShown(opened, {
      folders: [],
      notes: [{ path: "x.md", title: "Jetée" }],
    });
    renderScreen(view, screen, ignore);
    expect(view.listHeading.textContent).toBe("Corbeille");
    expect(view.notesList.querySelector(".trash-label")?.textContent).toBe("Jetée");
    expect(view.trashButton.classList.contains("selected")).toBe(true);
    expect(view.foldersList.querySelector(".folder-item.selected")).toBeNull();
    renderScreen(view, folderSelected(screen, "", []), ignore);
    expect(view.trashButton.classList.contains("selected")).toBe(false);
    expect(view.foldersList.querySelector(".folder-item.selected")).not.toBeNull();
  });
});

describe("affichage du filtre par étiquette", () => {
  const tagged = {
    path: "b.md",
    title: "Bêta",
    modified: 0,
    pinned: false,
    tags: ["perso"],
  };
  const opened = tagsRefreshed(workspaceOpened(workspace, ["Travail"], []), [
    { name: "perso", count: 1 },
  ]);

  it("montre la liste des étiquettes sous les dossiers ; un clic filtre", () => {
    const view = layout();
    const calls: string[] = [];
    renderScreen(view, opened, { ...ignore, selectTag: (tag) => calls.push(tag) });
    expect(view.tagFilter.hidden).toBe(true);
    expect(view.tagsList.querySelector(".tag-item.selected")).toBeNull();
    view.tagsList.querySelector<HTMLElement>(".tag-item")?.click();
    expect(calls).toEqual(["perso"]);
  });

  it("nomme l'étiquette en tête et dans la barre ; aucun dossier n'est en évidence", () => {
    const view = layout();
    const calls: string[] = [];
    const screen = tagSelected(opened, "perso", [tagged]);
    renderScreen(view, screen, { ...ignore, clearTag: () => calls.push("retirer") });
    expect(view.listHeading.textContent).toBe("#perso");
    expect(view.tagFilter.hidden).toBe(false);
    expect(view.tagFilter.querySelector(".tag-filter-name")?.textContent).toBe("#perso");
    expect(view.tagsList.querySelector(".tag-item.selected")).not.toBeNull();
    expect(view.foldersList.querySelector(".folder-item.selected")).toBeNull();
    expect(view.notesList.querySelector(".note-title")?.textContent).toBe("Bêta");
    view.tagFilter.querySelector<HTMLElement>(".tag-filter-clear")?.click();
    expect(calls).toEqual(["retirer"]);
  });

  it("pendant une recherche, la barre du filtre reste ; dans la corbeille, elle est cachée", () => {
    const view = layout();
    const screen = tagSelected(opened, "perso", [tagged]);
    renderScreen(view, searchTyped(screen, "pain"), ignore);
    expect(view.tagFilter.hidden).toBe(false);
    expect(view.tagsList.querySelector(".tag-item.selected")).not.toBeNull();
    renderScreen(view, trashShown(screen, { folders: [], notes: [] }), ignore);
    expect(view.tagFilter.hidden).toBe(true);
    expect(view.listHeading.textContent).toBe("Corbeille");
  });
});

describe("affichage de Récentes", () => {
  const note = (path: string, title: string) => ({
    path,
    title,
    modified: 0,
    pinned: false,
    tags: [],
  });
  const opened = workspaceOpened(workspace, ["Travail"], [note("a.md", "Alpha")]);

  it("l'entrée Récentes est juste au-dessus de la liste des étiquettes ; un clic la demande", () => {
    const view = layout();
    const calls: string[] = [];
    renderScreen(view, opened, { ...ignore, showRecent: () => calls.push("récentes") });
    expect(view.recentButton.textContent).toBe("Récentes");
    expect(view.recentButton.nextElementSibling).toBe(view.tagsList);
    expect(view.recentButton.classList.contains("selected")).toBe(false);
    view.recentButton.click();
    expect(calls).toEqual(["récentes"]);
  });

  it("montre les notes récentes, nommées en tête ; ni dossier en évidence, ni tri", () => {
    const view = layout();
    const screen = recentShown(opened, [note("Travail/b.md", "Bêta"), note("a.md", "Alpha")]);
    renderScreen(view, screen, ignore);
    expect(view.listHeading.textContent).toBe("Récentes");
    expect(view.recentButton.classList.contains("selected")).toBe(true);
    expect(view.foldersList.querySelector(".folder-item.selected")).toBeNull();
    expect(view.noteOrder.parentElement?.hidden).toBe(true);
    const titles = [...view.notesList.querySelectorAll(".note-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Bêta", "Alpha"]);
  });

  it("pendant une recherche, Récentes reste en évidence ; dans la corbeille, elle ne l'est plus", () => {
    const view = layout();
    const screen = recentShown(opened, [note("a.md", "Alpha")]);
    renderScreen(view, searchTyped(screen, "pain"), ignore);
    expect(view.recentButton.classList.contains("selected")).toBe(true);
    expect(view.listHeading.textContent).toBe("Récentes");
    expect(view.noteOrder.parentElement?.hidden).toBe(true);
    renderScreen(view, trashShown(screen, { folders: [], notes: [] }), ignore);
    expect(view.recentButton.classList.contains("selected")).toBe(false);
    expect(view.listHeading.textContent).toBe("Corbeille");
  });
});
