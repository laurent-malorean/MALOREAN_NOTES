// Journal : son dossier et la création de la note du jour au lancement, gardés pour chaque
// bibliothèque, et le modèle dont part la note du jour.
import type { LibraryNoteItem } from "../bridge";
import type { PreferenceStorage } from "./focus-preference";
import { templatesIn } from "./templates-folder";

const KEY = "malorean.journal:";

/** Le titre du modèle dont part la note du jour, dans le dossier des modèles. */
const TEMPLATE_TITLE = "Journal";

export interface JournalSettings {
  /** Le dossier du journal, créé au besoin. */
  readonly folder: string;
  /** Vrai si la note du jour est ouverte (et créée au besoin) au lancement. */
  readonly atLaunch: boolean;
}

export const DEFAULT_JOURNAL: JournalSettings = { folder: "Journal", atLaunch: true };

/** Les réglages du journal de cette bibliothèque ; ceux par défaut pour ce qui manque ou est illisible. */
export function loadJournal(storage: PreferenceStorage, library: string): JournalSettings {
  try {
    // Rien de gardé donne `null`, qui ne se décompose pas : les réglages par défaut, plus bas.
    const stored = JSON.parse(String(storage.getItem(KEY + library))) as Record<string, unknown>;
    const { folder, atLaunch } = stored;
    return {
      folder: typeof folder === "string" && folder !== "" ? folder : DEFAULT_JOURNAL.folder,
      atLaunch: typeof atLaunch === "boolean" ? atLaunch : DEFAULT_JOURNAL.atLaunch,
    };
  } catch {
    return DEFAULT_JOURNAL;
  }
}

/** Garde les réglages du journal de cette bibliothèque ; sans effet si le stockage est refusé. */
export function saveJournal(
  storage: PreferenceStorage,
  library: string,
  settings: JournalSettings,
): void {
  try {
    storage.setItem(KEY + library, JSON.stringify(settings));
  } catch {
    // Confort : les perdre redonne seulement les réglages par défaut.
  }
}

/** Le dossier du journal tel qu'il est tapé, sans espaces ni `/` autour ; vide, le dossier par défaut. */
export function journalFolder(typed: string): string {
  return typed.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_JOURNAL.folder;
}

/** Le modèle de la note du jour : la note titrée « Journal » du dossier des modèles, s'il y en a une. */
export function journalTemplate(
  notes: readonly LibraryNoteItem[],
  templatesFolder: string,
): string | null {
  const template = templatesIn(notes, templatesFolder).find((n) => n.title === TEMPLATE_TITLE);
  return template?.path ?? null;
}
