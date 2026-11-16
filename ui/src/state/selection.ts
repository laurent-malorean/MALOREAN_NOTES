import type { NoteListItem } from "../bridge/generated/NoteListItem";

/** La note ouverte au chargement : la première de la liste, déjà triée par date. */
export function initialSelection(notes: readonly NoteListItem[]): string | null {
  return notes[0]?.path ?? null;
}

/** La note sélectionnée après le renommage d'un fichier. */
export function followRename(selected: string | null, from: string, to: string): string | null {
  return selected === from ? to : selected;
}

/**
 * La note à ouvrir quand `removed` quitte la liste : la suivante, sinon la précédente ;
 * la première si `removed` n'y était pas.
 */
export function nextSelection(notes: readonly NoteListItem[], removed: string): string | null {
  const index = notes.findIndex((note) => note.path === removed);
  return (notes[index + 1] ?? notes[index - 1])?.path ?? null;
}
