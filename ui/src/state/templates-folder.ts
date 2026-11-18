// Dossier des modèles : choisi dans les réglages, gardé pour chaque espace de travail.
import type { WorkspaceNoteItem } from "../bridge";
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.templates:";

/** Le dossier des modèles de cet espace de travail ; rien s'il n'y en a pas ou si le stockage est refusé. */
export function loadTemplatesFolder(storage: PreferenceStorage, workspace: string): string | null {
  try {
    return storage.getItem(KEY + workspace) || null;
  } catch {
    return null;
  }
}

/** Garde le dossier des modèles de cet espace de travail, ou l'efface ; sans effet si le stockage est refusé. */
export function saveTemplatesFolder(
  storage: PreferenceStorage,
  workspace: string,
  folder: string | null,
): void {
  try {
    if (folder === null) storage.removeItem(KEY + workspace);
    else storage.setItem(KEY + workspace, folder);
  } catch {
    // Confort : le perdre oblige seulement à le choisir de nouveau.
  }
}

/** Les modèles : les notes qui sont directement dans le dossier des modèles. */
export function templatesIn(
  notes: readonly WorkspaceNoteItem[],
  folder: string,
): WorkspaceNoteItem[] {
  return notes.filter((note) => note.folder === folder);
}
