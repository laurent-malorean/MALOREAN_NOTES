// Canvas (fiche 0052, spécification § 11) : annuler et rétablir, par les versions successives du canvas.
import type { CanvasItem } from "../bridge";

/** Combien de changements on peut défaire. */
export const HISTORY_LIMIT = 50;

export interface CanvasHistory {
  readonly past: readonly CanvasItem[];
  readonly future: readonly CanvasItem[];
}

export const EMPTY_HISTORY: CanvasHistory = { past: [], future: [] };

/** L'historique après un changement : `was` est ce qu'on pouvait voir avant ; on ne peut plus rétablir. */
export function changed(history: CanvasHistory, was: CanvasItem): CanvasHistory {
  return { past: [...history.past, was].slice(-HISTORY_LIMIT), future: [] };
}

/** Le canvas d'avant et l'historique qui le garde ; `null` s'il n'y a rien à annuler. */
export function undone(
  history: CanvasHistory,
  current: CanvasItem,
): { canvas: CanvasItem; history: CanvasHistory } | null {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return null;
  return {
    canvas: previous,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
  };
}

/** Le canvas qu'on avait annulé et l'historique qui le garde ; `null` s'il n'y a rien à rétablir. */
export function redone(
  history: CanvasHistory,
  current: CanvasItem,
): { canvas: CanvasItem; history: CanvasHistory } | null {
  const [next, ...rest] = history.future;
  if (next === undefined) return null;
  return { canvas: next, history: { past: [...history.past, current], future: rest } };
}
