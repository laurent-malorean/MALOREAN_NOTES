// Ce que le canvas d'une colonne demande à l'application (fiche 0052) : choisir une note, importer un
// média, saisir un texte, choisir un groupe, copier, ouvrir une adresse.
import type * as Bridge from "../bridge";
import type { CanvasDeps } from "../screens/canvas-pane";
import type { PaneBackend } from "../screens/note-pane";
import { askName } from "../screens/name-prompt";
import { openPicker } from "../screens/picker";
import { folderOf } from "../state/folders";
import { matchingNotes } from "../state/quick-open";

const BACKEND_KEYS = [
  "readCanvas",
  "saveCanvas",
  "chooseExportFile",
  "exportImage",
  "openWebAddress",
  "listAllNotes",
  "attachFile",
] as const;

/** Ce que le canvas demande à Rust, par le pont. */
export type CanvasHostBackend = Pick<
  typeof Bridge,
  "readCanvas" | "saveCanvas" | "openWebAddress" | "listAllNotes"
> &
  Pick<PaneBackend, "attachFile"> &
  Required<Pick<PaneBackend, "chooseExportFile" | "exportImage">>;

/** Le pont a tout ce qu'il faut pour montrer des canvas (ce que n'ont pas les faux ponts de certains tests). */
export const hasCanvasBackend = (
  backend: Partial<CanvasHostBackend>,
): backend is CanvasHostBackend => BACKEND_KEYS.every((key) => backend[key] !== undefined);

export interface CanvasHostDeps {
  readonly backend: CanvasHostBackend;
  /** La fenêtre de choix. */
  readonly picker: HTMLDialogElement;
  /** La fenêtre où l'on saisit un texte. */
  readonly dialog: HTMLDialogElement;
}

/** Le chemin, depuis la racine, du fichier que désigne le lien Markdown `markdown` écrit dans le canvas `canvas`. */
export function attachedPath(canvas: string, markdown: string): string | null {
  const target = /\]\(([^)]*)\)/.exec(markdown)?.[1];
  if (target === undefined) return null;
  const folder = folderOf(canvas);
  const file = decodeURIComponent(target);
  return folder === "" ? file : `${folder}/${file}`;
}

/** Fait choisir un fichier du Mac par la fenêtre du système ; `null` si on annule. */
function pickedFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,audio/*,video/*,application/pdf";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export function createCanvasHost(deps: CanvasHostDeps): CanvasDeps {
  const { backend } = deps;
  return {
    ...{ readCanvas: backend.readCanvas, saveCanvas: backend.saveCanvas },
    ...{ chooseExportFile: backend.chooseExportFile, exportImage: backend.exportImage },
    openWebAddress: backend.openWebAddress,
    chooseNote: async () => {
      const notes = (await backend.listAllNotes()).filter((n) => !/\.canvas$/i.test(n.path));
      return new Promise((resolve) => {
        let chosen = false;
        openPicker(deps.picker, {
          label: "Ajouter une note",
          placeholder: "Titre de la note",
          empty: "Aucune note ne correspond",
          entries: (query) => matchingNotes(notes, query),
          describe: (note) => ({ label: note.title, detail: note.folder }),
          choose: (note) => {
            chosen = true;
            resolve(note.path);
          },
        });
        deps.picker.addEventListener("close", () => chosen || resolve(null), { once: true });
      });
    },
    // Le média est importé à côté du canvas, comme une pièce jointe d'une note.
    chooseMedia: async (canvas) => {
      const file = await pickedFile();
      if (file === null) return null;
      const attached = await backend.attachFile(canvas, file, {
        kind: "dropped",
        fileName: file.name,
      });
      return attachedPath(canvas, attached.markdown);
    },
    askText: (question, initial, confirm) => askName(deps.dialog, { question, initial, confirm }),
    chooseGroup: (groups) =>
      new Promise((resolve) => {
        let chosen = false;
        openPicker(deps.picker, {
          label: "Aller à un groupe",
          placeholder: "Nom du groupe",
          empty: "Aucun groupe ne correspond",
          entries: (query) =>
            groups.filter((g) => g.title.toLowerCase().includes(query.trim().toLowerCase())),
          describe: (group) => ({ label: group.title === "" ? "Groupe sans nom" : group.title }),
          choose: (group) => {
            chosen = true;
            resolve(group.id);
          },
        });
        deps.picker.addEventListener("close", () => chosen || resolve(null), { once: true });
      }),
    copy: (text) => void navigator.clipboard.writeText(text),
  };
}
