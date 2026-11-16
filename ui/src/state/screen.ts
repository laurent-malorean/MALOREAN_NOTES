import type { LibraryInfo, NoteListItem } from "../bridge";
import { movedPath } from "./folders";
import { followRename, initialSelection } from "./selection";

/**
 * Ce que montre la fenêtre : l'accueil, ou une bibliothèque ouverte avec ses dossiers,
 * le dossier choisi (`""` pour la racine), ses notes et la note sélectionnée.
 */
export type Screen =
  | { readonly kind: "welcome" }
  | {
      readonly kind: "library";
      readonly library: LibraryInfo;
      readonly folders: readonly string[];
      readonly folder: string;
      readonly notes: readonly NoteListItem[];
      readonly selected: string | null;
    };

/** L'écran du lancement, avant toute bibliothèque. */
export const welcome: Screen = { kind: "welcome" };

/** Une bibliothèque qu'on vient d'ouvrir, sur sa racine et sa note la plus récente. */
export function libraryOpened(
  library: LibraryInfo,
  folders: readonly string[],
  notes: readonly NoteListItem[],
): Screen {
  return {
    kind: "library",
    library,
    folders,
    folder: "",
    notes,
    selected: initialSelection(notes),
  };
}

/** La même bibliothèque, sur un autre dossier et sa note la plus récente. */
export function folderSelected(
  screen: Screen,
  folder: string,
  notes: readonly NoteListItem[],
): Screen {
  return screen.kind === "library"
    ? { ...screen, folder, notes, selected: initialSelection(notes) }
    : screen;
}

/** La même bibliothèque, avec la liste des dossiers relue. */
export function foldersRefreshed(screen: Screen, folders: readonly string[]): Screen {
  return screen.kind === "library" ? { ...screen, folders } : screen;
}

/** La même bibliothèque, après le déplacement (ou renommage) du dossier `from` en `to`. */
export function folderMoved(screen: Screen, from: string, to: string): Screen {
  if (screen.kind !== "library") return screen;
  const selected = screen.selected === null ? null : movedPath(screen.selected, from, to);
  return { ...screen, folder: movedPath(screen.folder, from, to), selected };
}

/** La même bibliothèque, avec la liste des notes relue. */
export function notesRefreshed(screen: Screen, notes: readonly NoteListItem[]): Screen {
  return screen.kind === "library" ? { ...screen, notes } : screen;
}

/** La même bibliothèque, avec une autre note sélectionnée (ou aucune). */
export function noteSelected(screen: Screen, path: string | null): Screen {
  return screen.kind === "library" ? { ...screen, selected: path } : screen;
}

/** La même bibliothèque, après le renommage d'un fichier de note. */
export function noteRenamed(screen: Screen, from: string, to: string): Screen {
  return screen.kind === "library"
    ? { ...screen, selected: followRename(screen.selected, from, to) }
    : screen;
}

/** La note sélectionnée, s'il y en a une. */
export function selectedNote(screen: Screen): string | null {
  return screen.kind === "library" ? screen.selected : null;
}

/** Le dossier affiché ; la racine sur l'accueil. */
export function currentFolder(screen: Screen): string {
  return screen.kind === "library" ? screen.folder : "";
}
