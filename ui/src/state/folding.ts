// Dossiers pliés de la colonne des dossiers : ceux dont les sous-dossiers sont cachés,
// gardés pour chaque bibliothèque d'un lancement à l'autre.
import { movedPath } from "./folders";
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.folded:";
const SEPARATOR = "/";

const ROOT = "";

/** Vrai si `folder` contient `path`, à n'importe quelle profondeur (pas lui-même) ; la racine
 * (chemin vide) contient tous les dossiers. */
const contains = (folder: string, path: string) =>
  folder === ROOT ? path !== ROOT : path.startsWith(folder + SEPARATOR);

/** Vrai si ce dossier contient au moins un sous-dossier. */
export function hasSubfolders(folders: readonly string[], path: string): boolean {
  return folders.some((other) => contains(path, other));
}

/** Plie le dossier, ou le déplie s'il était plié. */
export function foldToggled(folded: readonly string[], path: string): string[] {
  return folded.includes(path) ? folded.filter((f) => f !== path) : [...folded, path];
}

/** Les dossiers que la colonne montre : ceux qu'aucun dossier plié ne contient. */
export function visibleFolders(folders: readonly string[], folded: readonly string[]): string[] {
  return folders.filter((path) => !folded.some((f) => contains(f, path)));
}

/** Déplie les dossiers qui contiennent `path`, pour qu'il soit visible ; lui-même reste comme il est. */
export function parentsUnfolded(folded: readonly string[], path: string): string[] {
  return folded.filter((f) => !contains(f, path));
}

/** Les dossiers pliés après le déplacement (ou renommage) du dossier `from` en `to`. */
export function foldedMoved(folded: readonly string[], from: string, to: string): string[] {
  return folded.map((f) => movedPath(f, from, to));
}

/** Les dossiers pliés de cette bibliothèque ; aucun si rien n'est gardé, si c'est illisible ou refusé. */
export function loadFolded(storage: PreferenceStorage, library: string): string[] {
  let stored: unknown = null;
  try {
    // Rien de gardé : `JSON.parse(null)` donne `null`.
    stored = JSON.parse(storage.getItem(KEY + library) as string);
  } catch {
    // Valeur abîmée ou stockage refusé : comme si rien n'était gardé.
  }
  const readable = Array.isArray(stored) && stored.every((f) => typeof f === "string");
  return readable ? (stored as string[]) : [];
}

/** Garde les dossiers pliés de cette bibliothèque ; sans effet si le stockage est refusé. */
export function saveFolded(
  storage: PreferenceStorage,
  library: string,
  folded: readonly string[],
): void {
  try {
    if (folded.length === 0) storage.removeItem(KEY + library);
    else storage.setItem(KEY + library, JSON.stringify(folded));
  } catch {
    // Confort : le perdre déplie seulement les dossiers au lancement suivant.
  }
}
