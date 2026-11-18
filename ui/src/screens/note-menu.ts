// Ouvrir une note depuis une liste : le clic, le Cmd+clic, et le menu du clic droit (où l'ouvrir,
// ou la fermer), dans la liste ou sur un onglet.
import type { Placement } from "../state/columns";
import type { MenuEntry } from "./context-menu";

/** Ce que le menu d'une note peut demander. */
export interface NoteMenuActions {
  /** Ouvrir la note à cet emplacement. */
  place(placement: Placement): void;
  /** Fermer l'onglet de la note. */
  close(): void;
}

/** Le choix « Copier en texte mis en forme », dans le menu d'une note et celui d'un onglet. */
export const COPY_LABEL = "Copier en texte mis en forme";

/** Les choix du menu d'une note, dans l'ordre. */
export function noteMenu(actions: NoteMenuActions): MenuEntry[] {
  return [
    { label: "Ouvrir dans un nouvel onglet", run: () => actions.place("newTab") },
    { label: "Ouvrir à gauche", run: () => actions.place("left") },
    { label: "Ouvrir à droite", run: () => actions.place("right") },
    { label: "Fermer", run: () => actions.close() },
  ];
}

/** Ce qu'un clic sur une note peut demander. */
export interface NoteOpening {
  readonly open: (path: string) => void;
  readonly place: (path: string, placement: Placement) => void;
}

/** Un clic sur l'élément ouvre la note ; un Cmd+clic l'ouvre dans un nouvel onglet. */
export function openOnClick(element: HTMLElement, path: string, actions: NoteOpening): void {
  element.addEventListener("click", (event) => {
    if (event.metaKey) actions.place(path, "newTab");
    else actions.open(path);
  });
}
