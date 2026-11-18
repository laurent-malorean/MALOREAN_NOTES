// Ouverture rapide : les notes dont le titre correspond à ce qui est tapé.
import type { WorkspaceNoteItem } from "../bridge";
import { recentFirst } from "./recent-notes";

/** Au-delà, les notes ne sont pas proposées : il faut taper davantage. */
export const MAX_QUICK_OPEN_RESULTS = 50;

/** Sans majuscule ni accent, pour comparer ce qui est tapé et les titres. */
// Stryker disable MethodExpression: tout en majuscules ou tout en minuscules, la comparaison donne le même résultat.
export const folded = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();
// Stryker restore MethodExpression

/**
 * Les éléments dont `textOf` contient chaque mot de `query` (majuscules et accents ignorés) ;
 * ceux qui commencent par ce qui est tapé d'abord, puis les autres, chacun dans l'ordre reçu.
 */
export function matching<T>(items: readonly T[], query: string, textOf: (item: T) => string): T[] {
  const words = folded(query).match(/\S+/g) ?? [];
  const typed = words.join(" ");
  const found = items.filter((item) => words.every((word) => folded(textOf(item)).includes(word)));
  const first = found.filter((item) => folded(textOf(item)).startsWith(typed));
  return [...first, ...found.filter((item) => !first.includes(item))];
}

/** Les notes proposées pour `query`, la limite au plus ; sans rien taper, les notes récentes d'abord. */
export function matchingNotes(
  notes: readonly WorkspaceNoteItem[],
  query: string,
  recent?: readonly string[],
): WorkspaceNoteItem[] {
  const offered = recent && query.trim() === "" ? recentFirst(notes, recent) : notes;
  return matching(offered, query, (note) => note.title).slice(0, MAX_QUICK_OPEN_RESULTS);
}
