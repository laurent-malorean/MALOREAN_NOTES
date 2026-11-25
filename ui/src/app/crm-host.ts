// Ce que le CRM d'une colonne demande à l'application (fiche 0060) : le pont vers Rust et la
// confirmation avant un geste qui change d'autres fiches.
import type * as Bridge from "../bridge";
import type { CrmDeps } from "../screens/crm-pane";
import type { CrmBackend } from "../screens/crm-view";
import { askConfirmation } from "../screens/confirmation";
import { openPicker } from "../screens/picker";
import { matchingNotes } from "../state/quick-open";

/** Ce que le CRM d'une colonne demande à Rust : ses gestes, et la liste des notes pour en lier une à une action. */
export type CrmHostBackend = CrmBackend & Pick<typeof Bridge, "listAllNotes">;

const BACKEND_KEYS = [
  "readCrm",
  "createCrmAction",
  "moveCrmAction",
  "changeCrmAction",
  "deleteCrmAction",
  "changeCrmStages",
  "copyPlainText",
  "openWebAddress",
  "listAllNotes",
] as const;

/** Le pont a tout ce qu'il faut pour montrer des CRM (ce que n'ont pas les faux ponts de certains tests). */
export const hasCrmBackend = (backend: Partial<CrmHostBackend>): backend is CrmHostBackend =>
  BACKEND_KEYS.every((key) => backend[key] !== undefined);

export interface CrmHostDeps {
  readonly backend: CrmHostBackend;
  /** La fenêtre de confirmation. */
  readonly dialog: HTMLDialogElement;
  /** La fenêtre de choix, pour la recherche de notes. */
  readonly picker: HTMLDialogElement;
}

/** La recherche de notes de l'application : le titre de la note choisie, `null` si on annule. */
function chooseNote(backend: CrmHostBackend, picker: HTMLDialogElement): Promise<string | null> {
  return backend.listAllNotes().then(
    (notes) =>
      new Promise((resolve) => {
        let chosen = false;
        openPicker(picker, {
          label: "Lier une note",
          placeholder: "Titre de la note",
          empty: "Aucune note ne correspond",
          entries: (query) => matchingNotes(notes, query),
          describe: (note) => ({ label: note.title, detail: note.folder }),
          choose: (note) => {
            chosen = true;
            resolve(note.title);
          },
        });
        picker.addEventListener("close", () => chosen || resolve(null), { once: true });
      }),
  );
}

export function createCrmHost({ backend, dialog, picker }: CrmHostDeps): CrmDeps {
  return {
    backend,
    confirm: (question, confirm) => askConfirmation(dialog, { question, confirm }),
    chooseNote: () => chooseNote(backend, picker),
  };
}
