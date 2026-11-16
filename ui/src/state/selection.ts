import type { NoteListItem } from "../bridge/generated/NoteListItem";

/** La note ouverte au chargement : la première de la liste, déjà triée par date. */
export function initialSelection(notes: readonly NoteListItem[]): string | null {
  return notes[0]?.fileName ?? null;
}

/** La note sélectionnée après le renommage d'un fichier. */
export function followRename(selected: string | null, from: string, to: string): string | null {
  return selected === from ? to : selected;
}
