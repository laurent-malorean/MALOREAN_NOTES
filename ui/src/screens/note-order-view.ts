// Choix du tri de la liste, au-dessus de la liste des notes.
import { NOTE_ORDERS, type NoteOrder } from "../state/note-order";

/** Ce que l'utilisateur peut demander depuis le choix du tri. */
export interface NoteOrderActions {
  /** Trier la liste (et la recherche) autrement. */
  readonly sortNotes: (order: NoteOrder) => void;
}

/**
 * Montre le tri de la liste dans son choix (caché avec `null` : la corbeille n'a pas de tri) ;
 * en choisir un autre le demande.
 */
export function renderNoteOrder(
  choice: HTMLSelectElement,
  order: NoteOrder | null,
  sortNotes: (order: NoteOrder) => void,
): void {
  (choice.parentElement as HTMLElement).hidden = order === null;
  if (choice.options.length === 0) {
    choice.append(...NOTE_ORDERS.map(({ order, label }) => new Option(label, order)));
  }
  if (order !== null) choice.value = order;
  choice.onchange = () => sortNotes(choice.value as NoteOrder);
}
