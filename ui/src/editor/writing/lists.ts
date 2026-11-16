// Listes et citations : un élément laissé vide termine la liste, d'une seule touche.
import { Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

/** Une puce, un numéro (avec sa case de tâche éventuelle) ou des chevrons, et rien d'autre. */
const EMPTY_ITEM = /^\s*(?:(?:[-*+]|\d+[.)]) (?:\[[ xX]\] )?|(?:> ?)+)$/;

/** La ligne n'a que la marque d'un élément de liste ou de citation, sans texte. */
export function isEmptyItem(line: string): boolean {
  return EMPTY_ITEM.test(line);
}

/** Curseur au bout d'un élément vide : la marque est effacée, la liste ou la citation s'arrête. */
const endEmptyItem: Command = (view) => {
  const { main } = view.state.selection;
  const line = view.state.doc.lineAt(main.head);
  if (!main.empty || main.head !== line.to || !isEmptyItem(line.text)) return false;
  view.dispatch({ changes: { from: line.from, to: line.to } });
  return true;
};

/**
 * Passer à la ligne continue la liste ou la citation (CodeMirror) ; Entrée ou retour arrière
 * sur un élément vide la termine, avant que CodeMirror n'en fasse une liste espacée.
 */
export const listContinuation = Prec.high(
  keymap.of([
    { key: "Enter", run: endEmptyItem },
    { key: "Backspace", run: endEmptyItem },
  ]),
);
