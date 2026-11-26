// Dossier des modèles : choisi dans les réglages, gardé par le moteur avec chaque espace de travail
// (fiche 0077). Ici, ce que l'interface gardait avant, repris au lancement, et les modèles d'un dossier.
import type { TemplatesFolderItem, WorkspaceNoteItem } from "../bridge";
import type { PreferenceStorage } from "./focus-preference";

/** Le début des clés d'autrefois : suivi du dossier de l'espace de travail sur le disque. */
const KEY = "malorean.templates:";

/** Le stockage de la page, dont on peut parcourir les clés (`localStorage`). */
export interface KeyedStorage extends PreferenceStorage {
  readonly length: number;
  key(index: number): string | null;
}

/** Un dossier des modèles gardé autrefois par l'interface, avec la clé qui le portait. */
export interface StoredTemplatesFolder extends TemplatesFolderItem {
  readonly key: string;
}

/**
 * Les dossiers des modèles que l'interface avait gardés (un par espace de travail, rangé sous son
 * dossier sur le disque), à passer au moteur ; ceux qui sont vides sont ignorés. Rien si le
 * stockage est refusé.
 */
export function storedTemplatesFolders(storage: KeyedStorage): StoredTemplatesFolder[] {
  try {
    const found: StoredTemplatesFolder[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      const folder = key?.startsWith(KEY) ? storage.getItem(key) : null;
      if (key && folder) found.push({ key, location: key.slice(KEY.length), folder });
    }
    return found;
  } catch {
    return [];
  }
}

/** Efface les clés d'autrefois, une fois reprises par le moteur ; sans effet si le stockage est refusé. */
export function forgetTemplatesFolders(storage: PreferenceStorage, keys: readonly string[]): void {
  try {
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Confort : une clé oubliée sera simplement reprise, sans effet, au lancement suivant.
  }
}

/** Les modèles : les notes qui sont directement dans le dossier des modèles. */
export function templatesIn(
  notes: readonly WorkspaceNoteItem[],
  folder: string,
): WorkspaceNoteItem[] {
  return notes.filter((note) => note.folder === folder);
}
