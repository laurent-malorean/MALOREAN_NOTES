// Export d'une note : les formats proposés, et le dossier où s'ouvre la fenêtre d'enregistrement,
// celui du dernier export, gardé pour toute l'application.
import type { ExportFormatItem } from "../bridge";
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.export-folder";

/** Les formats proposés, dans l'ordre du choix, avec leur nom. */
export const EXPORT_FORMATS: readonly {
  readonly format: ExportFormatItem;
  readonly label: string;
}[] = [
  { format: "pdf", label: "PDF" },
  { format: "markdown", label: "Markdown" },
];

/** Le dossier du dernier export ; rien s'il n'y en a pas encore ou si le stockage est refusé. */
export function loadExportFolder(storage: PreferenceStorage): string | null {
  try {
    return storage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Garde le dossier du dernier export ; sans effet si le stockage est refusé. */
export function saveExportFolder(storage: PreferenceStorage, folder: string): void {
  try {
    storage.setItem(KEY, folder);
  } catch {
    // Confort : le perdre ramène seulement la fenêtre d'enregistrement au dossier Documents.
  }
}
