// Bandeau en bas de la note : mots, caractères et pages de la note, ou de la sélection.
import { type EditorState, Facet } from "@codemirror/state";
import { type Panel, showPanel } from "@codemirror/view";
import { DEFAULT_SETTINGS } from "../../state/settings";
import { countText, describeCounts, readableText } from "./counts";

/** Le nombre de caractères d'une page, tel que réglé ; le dernier fourni l'emporte. */
export const charactersPerPage = Facet.define<number, number>({
  combine: (values) => values.at(-1) ?? DEFAULT_SETTINGS.charactersPerPage,
});

/** Ce que dit le bandeau : les comptes de la note, ou ceux de la sélection s'il y en a une. */
export function statusText(state: EditorState): string {
  const { from, to } = state.selection.main;
  const describe = (text: string) =>
    describeCounts(countText(readableText(text)), state.facet(charactersPerPage));
  if (from === to) return describe(state.doc.toString());
  return `Sélection : ${describe(state.sliceDoc(from, to))}`;
}

function statusPanel(view: { state: EditorState }): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-status-bar";
  dom.setAttribute("aria-live", "polite");
  dom.textContent = statusText(view.state);
  return {
    dom,
    update(update) {
      // Stryker disable ConditionalExpression,EqualityOperator: optimisation — recompter à chaque mise à jour donnerait le même bandeau.
      const pageChanged =
        update.startState.facet(charactersPerPage) !== update.state.facet(charactersPerPage);
      if (update.docChanged || update.selectionSet || pageChanged)
        dom.textContent = statusText(update.state);
      // Stryker restore ConditionalExpression,EqualityOperator
    },
  };
}

/** Le bandeau, recalculé à chaque frappe et à chaque changement de sélection. */
export const statusBar = showPanel.of(statusPanel);
