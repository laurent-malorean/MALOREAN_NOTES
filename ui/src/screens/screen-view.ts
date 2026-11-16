import { nameOf } from "../state/folders";
import type { Screen } from "../state/screen";
import { type FolderActions, renderFoldersList } from "./folders-list";
import type { Layout } from "./layout";
import { renderNotesList } from "./notes-list";

/** Ce que l'utilisateur peut demander depuis l'espace de travail. */
export interface ScreenActions extends FolderActions {
  readonly open: (path: string) => void;
}

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
      layout.libraryName.textContent = folderName(screen.library.name, screen.folder);
      renderFoldersList(
        layout.foldersList,
        screen.library.name,
        screen.folders,
        screen.folder,
        actions,
      );
      renderNotesList(layout.notesList, screen.notes, screen.selected, actions.open);
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
