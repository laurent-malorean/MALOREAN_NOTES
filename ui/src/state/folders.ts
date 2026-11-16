// Dossiers vus par l'interface : arbre affiché et chemins qui suivent un déplacement.
// Les règles qui comptent sont vérifiées par Rust ; ici, seulement de quoi afficher et guider.

const SEPARATOR = "/";

/** Un dossier de la colonne : son chemin, son nom et sa profondeur (1 sous la racine). */
export interface FolderEntry {
  readonly path: string;
  readonly name: string;
  readonly depth: number;
}

/** Le nom d'un dossier : la dernière partie de son chemin. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf(SEPARATOR) + 1);
}

/** Les dossiers tels que la colonne les affiche, dans l'ordre reçu (déjà celui de l'arbre). */
export function folderTree(paths: readonly string[]): FolderEntry[] {
  return paths.map((path) => ({ path, name: nameOf(path), depth: path.split(SEPARATOR).length }));
}

/** Le dossier qui contient ce chemin ; `""` pour la racine. */
export function parentOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf(SEPARATOR), 0));
}

/** Le dossier d'une note ; `""` pour la racine. */
export const folderOf = parentOf;

/** Le chemin `path` après le déplacement du dossier `from` en `to` ; inchangé s'il n'y est pas. */
export function movedPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(from + SEPARATOR) ? to + path.slice(from.length) : path;
}

/** Vrai si le dossier peut aller dans `into` : ni en lui-même, ni dans ses sous-dossiers, ni là où il est. */
export function canMoveInto(folder: string, into: string): boolean {
  const inside = into === folder || into.startsWith(folder + SEPARATOR);
  return !inside && parentOf(folder) !== into;
}
