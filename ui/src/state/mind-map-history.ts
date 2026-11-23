// Annuler et rétablir les changements d'une carte mentale (fiche 0050) : 50 changements au plus.
import type { MindMapItem } from "../bridge";

/** Combien de changements on peut annuler. */
export const HISTORY_LIMIT = 50;

export interface MapHistory {
  readonly past: readonly MindMapItem[];
  readonly future: readonly MindMapItem[];
}

export const EMPTY_HISTORY: MapHistory = { past: [], future: [] };

/** La carte `was` est remplacée par une autre : on pourra y revenir ; rien n'est plus à rétablir. */
export function changed(history: MapHistory, was: MindMapItem): MapHistory {
  return { past: [...history.past, was].slice(-HISTORY_LIMIT), future: [] };
}

/** Annuler : la carte à montrer et l'historique, ou `null` s'il n'y a rien à annuler. */
export function undone(
  history: MapHistory,
  current: MindMapItem,
): { map: MindMapItem; history: MapHistory } | null {
  const map = history.past[history.past.length - 1];
  if (map === undefined) return null;
  return {
    map,
    history: { past: history.past.slice(0, -1), future: [...history.future, current] },
  };
}

/** Rétablir : la carte à montrer et l'historique, ou `null` s'il n'y a rien à rétablir. */
export function redone(
  history: MapHistory,
  current: MindMapItem,
): { map: MindMapItem; history: MapHistory } | null {
  const map = history.future[history.future.length - 1];
  if (map === undefined) return null;
  return {
    map,
    history: { past: [...history.past, current], future: history.future.slice(0, -1) },
  };
}
