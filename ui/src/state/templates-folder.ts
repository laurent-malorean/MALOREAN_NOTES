// Dossier des modèles : choisi dans les réglages, gardé pour chaque bibliothèque.
import type { LibraryNoteItem } from "../bridge";
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.templates:";

/** Le dossier des modèles de cette bibliothèque ; rien s'il n'y en a pas ou si le stockage est refusé. */
export function loadTemplatesFolder(storage: PreferenceStorage, library: string): string | null {
  try {
    return storage.getItem(KEY + library) || null;
  } catch {
    return null;
  }
}

/** Garde le dossier des modèles de cette bibliothèque, ou l'efface ; sans effet si le stockage est refusé. */
export function saveTemplatesFolder(
  storage: PreferenceStorage,
  library: string,
  folder: string | null,
): void {
  try {
    if (folder === null) storage.removeItem(KEY + library);
    else storage.setItem(KEY + library, folder);
  } catch {
    // Confort : le perdre oblige seulement à le choisir de nouveau.
  }
}

/** Les modèles : les notes qui sont directement dans le dossier des modèles. */
export function templatesIn(notes: readonly LibraryNoteItem[], folder: string): LibraryNoteItem[] {
  return notes.filter((note) => note.folder === folder);
}
