// Tri de la liste : par date de modification ou par titre ; gardé pour
// chaque espace de travail. Rust range les notes ; l'interface choisit seulement l'ordre.
import type { NoteOrderItem } from "../bridge";
import type { PreferenceStorage } from "./focus-preference";

export type NoteOrder = NoteOrderItem;

/** Le tri par défaut : la plus récemment modifiée d'abord. */
export const DEFAULT_ORDER: NoteOrder = "modified";

const KEY = "malorean.order:";

/** Les tris proposés, dans l'ordre du choix, avec leur nom. */
export const NOTE_ORDERS: readonly { readonly order: NoteOrder; readonly label: string }[] = [
  { order: "modified", label: "Date de modification" },
  { order: "title", label: "Titre" },
];

/** Le tri gardé pour cet espace de travail ; par défaut s'il n'y en a pas, s'il est illisible ou si le stockage est refusé. */
export function loadNoteOrder(storage: PreferenceStorage, workspace: string): NoteOrder {
  try {
    const stored = storage.getItem(KEY + workspace);
    return (
      NOTE_ORDERS.map((choice) => choice.order).find((order) => order === stored) ?? DEFAULT_ORDER
    );
  } catch {
    return DEFAULT_ORDER;
  }
}

/** Garde le tri de cet espace de travail (le tri par défaut efface la clé) ; sans effet si le stockage est refusé. */
export function saveNoteOrder(
  storage: PreferenceStorage,
  workspace: string,
  order: NoteOrder,
): void {
  try {
    if (order === DEFAULT_ORDER) storage.removeItem(KEY + workspace);
    else storage.setItem(KEY + workspace, order);
  } catch {
    // Confort : le perdre ramène seulement le tri par défaut au prochain lancement.
  }
}
