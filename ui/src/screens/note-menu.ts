// Menu d'une note, au clic droit dans la liste ou sur un onglet : où l'ouvrir, ou la fermer.
import type { Placement } from "../state/columns";
import type { MenuEntry } from "./context-menu";

/** Ce que le menu d'une note peut demander. */
export interface NoteMenuActions {
  /** Ouvrir la note à cet emplacement. */
  place(placement: Placement): void;
  /** Fermer l'onglet de la note. */
  close(): void;
}

/** Les choix du menu d'une note, dans l'ordre. */
export function noteMenu(actions: NoteMenuActions): MenuEntry[] {
  return [
    { label: "Ouvrir dans un nouvel onglet", run: () => actions.place("newTab") },
    { label: "Ouvrir à gauche", run: () => actions.place("left") },
    { label: "Ouvrir à droite", run: () => actions.place("right") },
    { label: "Fermer", run: () => actions.close() },
  ];
}
