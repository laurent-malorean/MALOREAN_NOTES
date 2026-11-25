// Ce que le CRM d'une colonne demande à l'application (fiche 0060) : le pont vers Rust et la
// confirmation avant un geste qui change d'autres fiches.
import type * as Bridge from "../bridge";
import type { CrmDeps } from "../screens/crm-pane";
import type { CrmBackend } from "../screens/crm-view";
import { askConfirmation } from "../screens/confirmation";
import { chooseLinkable } from "./link-picker";

/** Ce que le CRM d'une colonne demande à Rust : ses gestes, et la liste de ce qu'on peut lier pour en lier un à une action. */
export type CrmHostBackend = CrmBackend & Pick<typeof Bridge, "listLinkable">;

const BACKEND_KEYS = [
  "readCrm",
  "createCrmAction",
  "moveCrmAction",
  "changeCrmAction",
  "deleteCrmAction",
  "changeCrmStages",
  "createCrmPerson",
  "createCrmCompany",
  "createCrmProject",
  "changeCrmProject",
  "deleteCrmProject",
  "changeCrmPerson",
  "deleteCrmPerson",
  "changeCrmCompany",
  "deleteCrmCompany",
  "crmEmailIsKnown",
  "copyPlainText",
  "openWebAddress",
  "listLinkable",
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

export function createCrmHost({ backend, dialog, picker }: CrmHostDeps): CrmDeps {
  return {
    backend,
    confirm: (question, confirm) => askConfirmation(dialog, { question, confirm }),
    chooseNote: async () => (await chooseLinkable(backend, picker))?.link ?? null,
  };
}
