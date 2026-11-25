// Ce que le CRM d'une colonne demande à l'application (fiche 0060) : le pont vers Rust et la
// confirmation avant un geste qui change d'autres fiches.
import type { CrmDeps } from "../screens/crm-pane";
import type { CrmBackend } from "../screens/crm-view";
import { askConfirmation } from "../screens/confirmation";

const BACKEND_KEYS = [
  "readCrm",
  "createCrmAction",
  "moveCrmAction",
  "changeCrmAction",
  "changeCrmStages",
] as const;

/** Le pont a tout ce qu'il faut pour montrer des CRM (ce que n'ont pas les faux ponts de certains tests). */
export const hasCrmBackend = (backend: Partial<CrmBackend>): backend is CrmBackend =>
  BACKEND_KEYS.every((key) => backend[key] !== undefined);

export interface CrmHostDeps {
  readonly backend: CrmBackend;
  /** La fenêtre de confirmation. */
  readonly dialog: HTMLDialogElement;
}

export function createCrmHost({ backend, dialog }: CrmHostDeps): CrmDeps {
  return {
    backend,
    confirm: (question, confirm) => askConfirmation(dialog, { question, confirm }),
  };
}
