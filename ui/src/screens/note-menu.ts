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
/** Le choix « Copier en Markdown », juste après. */
export const MARKDOWN_COPY_LABEL = "Copier en Markdown";
/** Le choix « Historique… », qui ouvre l'historique des versions de la note. */
export const HISTORY_LABEL = "Historique…";

/** Les choix du menu d'une note, dans l'ordre. */
export function noteMenu(actions: NoteMenuActions): MenuEntry[] {
  return [
    { label: "Ouvrir dans un nouvel onglet", icon: "new-tab", run: () => actions.place("newTab") },
    { label: "Ouvrir à gauche", icon: "open-left", run: () => actions.place("left") },
    { label: "Ouvrir à droite", icon: "open-right", run: () => actions.place("right") },
    { label: "Fermer", icon: "close", run: () => actions.close() },
  ];
}

/** Ce qu'un clic sur une note peut demander. */
export interface NoteOpening {
  /** Ouvre la note ; `node`, pour une carte mentale, est le chemin du nœud à y choisir. */
  readonly open: (path: string, node?: string | null) => void;
  readonly place: (path: string, placement: Placement) => void;
}

/** Un clic sur l'élément ouvre la note ; un Cmd+clic l'ouvre dans un nouvel onglet. */
export function openOnClick(
  element: HTMLElement,
  path: string,
  actions: NoteOpening,
  node: string | null = null,
): void {
  element.addEventListener("click", (event) => {
    if (event.metaKey) actions.place(path, "newTab");
    else actions.open(path, node);
  });
}
