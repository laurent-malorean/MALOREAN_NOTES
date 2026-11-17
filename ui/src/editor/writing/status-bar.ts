// Bandeau en bas de la note : mots, caractères et pages de la note, ou de la sélection.
import type { EditorState } from "@codemirror/state";
import { type Panel, showPanel } from "@codemirror/view";
import { countText, describeCounts, readableText } from "./counts";

/** Ce que dit le bandeau : les comptes de la note, ou ceux de la sélection s'il y en a une. */
export function statusText(state: EditorState): string {
  const { from, to } = state.selection.main;
  if (from === to) return describeCounts(countText(readableText(state.doc.toString())));
  return `Sélection : ${describeCounts(countText(readableText(state.sliceDoc(from, to))))}`;
}

function statusPanel(view: { state: EditorState }): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-status-bar";
  dom.setAttribute("aria-live", "polite");
  dom.textContent = statusText(view.state);
  return {
    dom,
    update(update) {
      // Stryker disable next-line ConditionalExpression: optimisation — recompter à chaque mise à jour donnerait le même bandeau.
      if (update.docChanged || update.selectionSet) dom.textContent = statusText(update.state);
    },
  };
}

/** Le bandeau, recalculé à chaque frappe et à chaque changement de sélection. */
export const statusBar = showPanel.of(statusPanel);
