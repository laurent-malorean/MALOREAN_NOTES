import { nameOf } from "../state/folders";
import { type Screen, searchable } from "../state/screen";
import { type FolderActions, renderFoldersList } from "./folders-list";
import type { Layout } from "./layout";
import { type NoteActions, renderNotesList } from "./notes-list";
import { renderSearchResults } from "./search-results";
import { renderTrash, type TrashActions } from "./trash-view";

/** Ce que l'utilisateur peut demander depuis l'espace de travail. */
export type ScreenActions = FolderActions & NoteActions & TrashActions;

const TRASH_TITLE = "Corbeille";

/** Le nom du dossier affiché : celui de la bibliothèque pour la racine. */
function folderName(libraryName: string, folder: string): string {
  return folder === "" ? libraryName : nameOf(folder);
}

/** Met la fenêtre en accord avec l'état de l'écran ; chaque cas est traité. */
export function renderScreen(layout: Layout, screen: Screen, actions: ScreenActions): void {
  switch (screen.kind) {
    case "welcome":
      layout.welcome.hidden = false;
      layout.workspace.hidden = true;
      return;
    case "library":
      layout.welcome.hidden = true;
      layout.workspace.hidden = false;
      layout.libraryName.textContent = screen.trash
        ? TRASH_TITLE
        : folderName(screen.library.name, screen.folder);
      renderFoldersList(
        layout.foldersList,
        screen.library.name,
        screen.folders,
        screen.trash ? null : screen.folder,
        actions,
      );
      layout.trashButton.classList.toggle("selected", screen.trash !== null);
      // Remettre la même valeur ne déplace pas le curseur du champ.
      layout.searchField.value = screen.search?.query ?? "";
      if (screen.trash) {
        renderTrash(layout.notesList, screen.library.name, screen.trash, actions);
      } else if (screen.search && searchable(screen.search.query)) {
        renderSearchResults(
          layout.notesList,
          screen.library.name,
          screen.search.results,
          screen.selected,
          actions,
        );
      } else {
        renderNotesList(layout.notesList, screen.notes, screen.selected, actions);
      }
      return;
    // Stryker disable all: cas impossible, le compilateur vérifie que tous les cas sont traités.
    /* istanbul ignore next -- cas impossible : le compilateur vérifie que tous les cas sont traités */
    default: {
      const unhandled: never = screen;
      return unhandled;
    }
    // Stryker restore all
  }
}
