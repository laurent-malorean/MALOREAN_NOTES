import type { WorkspaceInfo, NoteListItem, SearchResultItem, TagItem, TrashInfo } from "../bridge";
import { movedPath } from "./folders";
import { foldedMoved, foldToggled, parentsUnfolded } from "./folding";
import { DEFAULT_ORDER, type NoteOrder } from "./note-order";
import { initialSelection } from "./selection";

/**
 * Une recherche en cours : les mots tapés et les notes trouvées à la dernière réponse
 * (`null` tant qu'aucune réponse n'est arrivée).
 */
export interface Search {
  readonly query: string;
  readonly results: readonly SearchResultItem[] | null;
}

/**
 * Ce que montre la fenêtre : l'accueil, ou un espace de travail ouvert avec ses dossiers,
 * le dossier choisi (`""` pour la racine), ses notes, la note sélectionnée, la recherche
 * en cours et la corbeille affichée (`null` pour l'une et l'autre : la liste montre les notes
 * du dossier), les dossiers pliés de la colonne des dossiers, le filtre par étiquette (`null` :
 * aucun ; sinon `notes` sont les notes de tout l'espace de travail qui portent cette étiquette), la
 * liste des étiquettes, le tri de la liste et Récentes (`recent` : la liste montre les notes
 * récentes à la place de celles du dossier).
 */
export type Screen =
  | { readonly kind: "welcome" }
  | {
      readonly kind: "workspace";
      readonly workspace: WorkspaceInfo;
      readonly folders: readonly string[];
      readonly folder: string;
      readonly notes: readonly NoteListItem[];
      readonly selected: string | null;
      readonly search: Search | null;
      readonly trash: TrashInfo | null;
      readonly folded: readonly string[];
      readonly tag: string | null;
      readonly tags: readonly TagItem[];
      readonly order: NoteOrder;
      readonly recent: boolean;
    };

/** L'écran du lancement, avant tout espace de travail. */
export const welcome: Screen = { kind: "welcome" };

/**
 * Un espace de travail qu'on vient d'ouvrir, sur sa racine et la première note de sa liste, avec ses
 * dossiers pliés (aucun : tous dépliés) et son tri gardés.
 */
export function workspaceOpened(
  workspace: WorkspaceInfo,
  folders: readonly string[],
  notes: readonly NoteListItem[],
  folded: readonly string[] = [],
  order: NoteOrder = DEFAULT_ORDER,
): Screen {
  return {
    kind: "workspace",
    workspace,
    folders,
    folder: "",
    notes,
    selected: initialSelection(notes),
    search: null,
    trash: null,
    folded,
    tag: null,
    tags: [],
    order,
    recent: false,
  };
}

/** Le même espace de travail, sous un autre nom ; son dossier ne change pas. */
export function workspaceRenamed(screen: Screen, name: string): Screen {
  return screen.kind === "workspace"
    ? { ...screen, workspace: { ...screen.workspace, name } }
    : screen;
}

/** Le même espace de travail, sur un autre dossier, rendu visible, et sa note la plus récente. */
export function folderSelected(
  screen: Screen,
  folder: string,
  notes: readonly NoteListItem[],
): Screen {
  if (screen.kind !== "workspace") return screen;
  const selected = initialSelection(notes);
  const folded = parentsUnfolded(screen.folded, folder);
  return {
    ...screen,
    ...{ folder, notes, selected, search: null, trash: null, folded, tag: null, recent: false },
  };
}

/** Le même espace de travail, avec ce dossier plié, ou déplié s'il était plié. */
export function folderFolded(screen: Screen, path: string): Screen {
  return screen.kind === "workspace"
    ? { ...screen, folded: foldToggled(screen.folded, path) }
    : screen;
}

/** Le même espace de travail, avec les dossiers qui contiennent celui-ci dépliés. */
export function folderRevealed(screen: Screen, path: string): Screen {
  return screen.kind === "workspace"
    ? { ...screen, folded: parentsUnfolded(screen.folded, path) }
    : screen;
}

/** Le même espace de travail, avec la liste des dossiers relue. */
export function foldersRefreshed(screen: Screen, folders: readonly string[]): Screen {
  return screen.kind === "workspace" ? { ...screen, folders } : screen;
}

/**
 * Le même espace de travail, après le déplacement (ou renommage) du dossier `from` en `to` ; les
 * dossiers pliés le suivent et le dossier affiché reste visible.
 */
export function folderMoved(screen: Screen, from: string, to: string): Screen {
  if (screen.kind !== "workspace") return screen;
  const selected = screen.selected === null ? null : movedPath(screen.selected, from, to);
  const folder = movedPath(screen.folder, from, to);
  const folded = parentsUnfolded(foldedMoved(screen.folded, from, to), folder);
  return { ...screen, folder, selected, folded };
}

/** Le même espace de travail, avec la liste des notes relue. */
export function notesRefreshed(screen: Screen, notes: readonly NoteListItem[]): Screen {
  return screen.kind === "workspace" ? { ...screen, notes } : screen;
}

/** Le même espace de travail, avec une autre note sélectionnée (ou aucune). */
export function noteSelected(screen: Screen, path: string | null): Screen {
  return screen.kind === "workspace" ? { ...screen, selected: path } : screen;
}

/** Seuil de recherche : nombre minimal de caractères pour chercher, sauf pour un nombre. */
export const SEARCH_MIN_LENGTH = 3;

/** Vrai si le texte tapé est assez long pour lancer une recherche, ou si c'est un nombre. */
export function searchable(query: string): boolean {
  const text = query.trim();
  return text.length >= SEARCH_MIN_LENGTH || /^\d+$/.test(text);
}

/**
 * La recherche tapée : elle commence, continue avec les résultats précédents, ou s'arrête si vide.
 * Sous le seuil de recherche, le texte est gardé sans résultat : la liste montre le dossier.
 */
export function searchTyped(screen: Screen, query: string): Screen {
  if (screen.kind !== "workspace") return screen;
  if (query.trim() === "") return { ...screen, search: null };
  const previous = searchable(query) ? screen.search?.results : null;
  return {
    ...screen,
    search: { query, results: previous ?? null },
    trash: null,
  };
}

/** La corbeille, montrée à la place des notes du dossier. */
export function trashShown(screen: Screen, trash: TrashInfo): Screen {
  return screen.kind === "workspace" ? { ...screen, trash, search: null } : screen;
}

/** Les notes trouvées pour `query` ; ignorées si la recherche a changé ou s'est arrêtée entre-temps. */
export function searchAnswered(
  screen: Screen,
  query: string,
  results: readonly SearchResultItem[],
): Screen {
  // Stryker disable next-line ConditionalExpression: l'accueil n'a pas de recherche, la seconde condition l'écarte aussi ; TypeScript exige la première.
  if (screen.kind !== "workspace" || screen.search?.query !== query) return screen;
  return { ...screen, search: { query, results } };
}

/** La note sélectionnée, s'il y en a une. */
export function selectedNote(screen: Screen): string | null {
  return screen.kind === "workspace" ? screen.selected : null;
}

/** Le dossier affiché ; la racine sur l'accueil. */
export function currentFolder(screen: Screen): string {
  return screen.kind === "workspace" ? screen.folder : "";
}

/**
 * Le filtre par étiquette : les notes de tout l'espace de travail qui portent `tag`, la première
 * sélectionnée ; la recherche est vidée et la corbeille quittée.
 */
export function tagSelected(screen: Screen, tag: string, notes: readonly NoteListItem[]): Screen {
  if (screen.kind !== "workspace") return screen;
  const selected = initialSelection(notes);
  return { ...screen, tag, notes, selected, search: null, trash: null, recent: false };
}

/** Le filtre retiré : les notes du dossier reviennent, la note sélectionnée reste la même. */
export function tagCleared(screen: Screen, notes: readonly NoteListItem[]): Screen {
  return screen.kind === "workspace" ? { ...screen, tag: null, notes } : screen;
}

/** Le même espace de travail, avec la liste des étiquettes relue. */
export function tagsRefreshed(screen: Screen, tags: readonly TagItem[]): Screen {
  return screen.kind === "workspace" ? { ...screen, tags } : screen;
}

/** L'étiquette du filtre, s'il y en a un. */
export function activeTag(screen: Screen): string | null {
  return screen.kind === "workspace" ? screen.tag : null;
}

/** Le même espace de travail, avec un autre tri de la liste ; les notes sont relues ensuite. */
export function orderChosen(screen: Screen, order: NoteOrder): Screen {
  return screen.kind === "workspace" ? { ...screen, order } : screen;
}

/** Le tri de la liste ; celui par défaut sur l'accueil. */
export function noteOrder(screen: Screen): NoteOrder {
  return screen.kind === "workspace" ? screen.order : DEFAULT_ORDER;
}

/**
 * Récentes : les notes récentes à la place de celles du dossier, la première sélectionnée ; la
 * recherche est vidée, la corbeille et le filtre par étiquette quittés.
 */
export function recentShown(screen: Screen, notes: readonly NoteListItem[]): Screen {
  if (screen.kind !== "workspace") return screen;
  const selected = initialSelection(notes);
  return { ...screen, recent: true, notes, selected, search: null, trash: null, tag: null };
}

/** Vrai si la liste montre les notes récentes (même mises de côté par une recherche ou la corbeille). */
export function recentOn(screen: Screen): boolean {
  return screen.kind === "workspace" && screen.recent;
}
