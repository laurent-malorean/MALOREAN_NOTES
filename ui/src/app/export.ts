// Export d'une note : le format choisi au clavier, puis le fichier dans la fenêtre d'enregistrement
// du Mac ; Rust écrit le Markdown, WebKit imprime en PDF le rendu HTML posé sur la feuille d'impression.
import type * as Bridge from "../bridge";
import { openPicker } from "../screens/picker";
import { activeNote } from "../state/columns";
import { EXPORT_FORMATS, loadExportFolder, saveExportFolder } from "../state/export";
import type { PreferenceStorage } from "../state/focus-preference";
import { matching } from "../state/quick-open";
import { noteHtml } from "../rendering/note-html";
import type { OpenColumns } from "./columns";
import { imageIn } from "./panes";

export interface ExportDeps {
  readonly backend: Pick<
    typeof Bridge,
    "readNote" | "chooseExportFile" | "exportMarkdown" | "exportPdf" | "fileAddress"
  >;
  readonly columns: Pick<OpenColumns, "current" | "flushedPath">;
  /** Le dossier de l'espace de travail ouvert, où sont les images des notes. */
  workspacePath(): string;
  /** La fenêtre de choix au clavier. */
  readonly picker: HTMLDialogElement;
  /** La feuille d'impression, qui reçoit le rendu HTML de la note à imprimer en PDF. */
  readonly sheet: HTMLElement;
  /** Où le dossier du dernier export est gardé. */
  readonly storage: PreferenceStorage;
  /** Montre un message quelques secondes. */
  show(message: string): void;
  run(action: Promise<unknown>): void;
}

export interface Exporting {
  /** Fait choisir le format, puis le fichier, et exporte la note ; sans chemin, celle de la colonne active. */
  exportNote(path?: string): void;
}

/** Pose le rendu de la note sur la feuille d'impression, ses images chargées (ou en échec). */
async function prepareSheet(deps: ExportDeps, note: Bridge.NoteContent) {
  deps.sheet.innerHTML = await noteHtml(note.content, {
    resolveImage: (src) => imageIn(deps.workspacePath(), note.path, src, deps.backend.fileAddress),
  });
  const images = [...deps.sheet.querySelectorAll("img")];
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
}

async function exportAs(deps: ExportDeps, path: string, format: Bridge.ExportFormatItem) {
  const source = await deps.columns.flushedPath(path);
  const note = await deps.backend.readNote(source);
  const file = await deps.backend.chooseExportFile(
    note.title,
    format,
    loadExportFolder(deps.storage),
  );
  if (file === null) return;
  saveExportFolder(deps.storage, file.folder);
  if (format === "markdown") await deps.backend.exportMarkdown(source, file.path);
  else await prepareSheet(deps, note).then(() => deps.backend.exportPdf(file.path));
  deps.show(`« ${note.title} » exportée dans ${file.path}`);
}

function exportNote(deps: ExportDeps, path: string | null) {
  if (path === null) return;
  openPicker(deps.picker, {
    label: "Exporter",
    placeholder: "Format",
    empty: "Aucun format ne correspond",
    entries: (query) => matching(EXPORT_FORMATS, query, (choice) => choice.label),
    describe: ({ label }) => ({ label }),
    choose: ({ format }) => deps.run(exportAs(deps, path, format)),
  });
}

export function createExport(deps: ExportDeps): Exporting {
  return {
    exportNote: (path) => exportNote(deps, path ?? activeNote(deps.columns.current())),
  };
}
