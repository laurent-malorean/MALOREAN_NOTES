import type { LibraryInfo, NoteListItem, SearchResultItem, TrashInfo } from "../bridge";
import { movedPath } from "./folders";
import { followRename, initialSelection } from "./selection";

/**
 * Une recherche en cours : les mots tapés et les notes trouvées à la dernière réponse
 * (`null` tant qu'aucune réponse n'est arrivée).
 */
export interface Search {
  readonly query: string;
  readonly results: readonly SearchResultItem[] | null;
}

/**
 * Ce que montre la fenêtre : l'accueil, ou une bibliothèque ouverte avec ses dossiers,
 * le dossier choisi (`""` pour la racine), ses notes, la note sélectionnée, la recherche
 * en cours et la corbeille affichée (`null` pour l'une et l'autre : la liste montre les notes
 * du dossier).
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
      readonly search: Search | null;
      readonly trash: TrashInfo | null;
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
    search: null,
    trash: null,
  };
}

/** La même bibliothèque, sur un autre dossier et sa note la plus récente. */
export function folderSelected(
  screen: Screen,
  folder: string,
  notes: readonly NoteListItem[],
): Screen {
  return screen.kind === "library"
    ? { ...screen, folder, notes, selected: initialSelection(notes), search: null, trash: null }
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

/** La recherche tapée : elle commence, continue avec les résultats précédents, ou s'arrête si vide. */
export function searchTyped(screen: Screen, query: string): Screen {
  if (screen.kind !== "library") return screen;
  if (query.trim() === "") return { ...screen, search: null };
  return {
    ...screen,
    search: { query, results: screen.search?.results ?? null },
    trash: null,
  };
}

/** La corbeille, montrée à la place des notes du dossier. */
export function trashShown(screen: Screen, trash: TrashInfo): Screen {
  return screen.kind === "library" ? { ...screen, trash, search: null } : screen;
}

/** Les notes trouvées pour `query` ; ignorées si la recherche a changé ou s'est arrêtée entre-temps. */
export function searchAnswered(
  screen: Screen,
  query: string,
  results: readonly SearchResultItem[],
): Screen {
  // Stryker disable next-line ConditionalExpression: l'accueil n'a pas de recherche, la seconde condition l'écarte aussi ; TypeScript exige la première.
  if (screen.kind !== "library" || screen.search?.query !== query) return screen;
  return { ...screen, search: { query, results } };
}

/** La note sélectionnée, s'il y en a une. */
export function selectedNote(screen: Screen): string | null {
  return screen.kind === "library" ? screen.selected : null;
}

/** Le dossier affiché ; la racine sur l'accueil. */
export function currentFolder(screen: Screen): string {
  return screen.kind === "library" ? screen.folder : "";
}
