import type { LibraryInfo, NoteListItem } from "../bridge";
import { followRename, initialSelection } from "./selection";

/** Ce que montre la fenêtre : l'accueil, ou une bibliothèque ouverte et sa note sélectionnée. */
export type Screen =
  | { readonly kind: "welcome" }
  | {
      readonly kind: "library";
      readonly library: LibraryInfo;
      readonly notes: readonly NoteListItem[];
      readonly selected: string | null;
    };

/** L'écran du lancement, avant toute bibliothèque. */
export const welcome: Screen = { kind: "welcome" };

/** Une bibliothèque qu'on vient d'ouvrir, sur sa note la plus récente. */
export function libraryOpened(library: LibraryInfo, notes: readonly NoteListItem[]): Screen {
  return { kind: "library", library, notes, selected: initialSelection(notes) };
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
