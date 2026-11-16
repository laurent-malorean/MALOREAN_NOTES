// Mode focus à l'écran : tout ce qui n'est pas le passage en cours est estompé.
import type { EditorState, Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { type FocusUnit, focusRange } from "./focus-range";

export const DIMMED_CLASS = "cm-focus-dimmed";
const dimmed = Decoration.mark({ class: DIMMED_CLASS });

function dimAround(state: EditorState, unit: FocusUnit): DecorationSet {
  const { from, to } = focusRange(state.doc, state.selection.main.head, unit);
  const ranges = [];
  if (from > 0) ranges.push(dimmed.range(0, from));
  if (to < state.doc.length) ranges.push(dimmed.range(to, state.doc.length));
  return Decoration.set(ranges);
}

/** Le mode focus réglé sur `unit` ; aucun effet sans unité. */
export function focusMode(unit: FocusUnit | null): Extension {
  if (!unit) return [];
  // Stryker disable next-line StringLiteral: optimisation — recalculer plus souvent donnerait le même affichage.
  return EditorView.decorations.compute(["doc", "selection"], (state) => dimAround(state, unit));
}
