// La première ligne d'une note vide est son titre : ce qu'on y tape prend la marque `# `.
import { EditorView } from "@codemirror/view";

const TITLE_MARK = "# ";

/**
 * Ce qu'il faut écrire à la place de `text`, tapé dans une note dont le texte est `doc` :
 * `# ` devant, si la note est vide et que la frappe commence un mot ; sinon `null`.
 */
export function titleTyped(doc: string, text: string): string | null {
  return doc === "" && /^[^#\s]/.test(text) ? TITLE_MARK + text : null;
}

/** Taper dans une note vide écrit son titre, comme le suggère le texte d'attente. */
export const firstTitle = EditorView.inputHandler.of((view, _from, _to, text) => {
  const insert = titleTyped(view.state.doc.toString(), text);
  if (insert === null) return false;
  view.dispatch({ changes: { from: 0, insert }, selection: { anchor: insert.length } });
  return true;
});
