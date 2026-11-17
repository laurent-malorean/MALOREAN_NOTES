// Rechercher et remplacer dans la note ouverte : le panneau de CodeMirror, en français.
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

/** Les textes du panneau de recherche, traduits. */
const FRENCH: Readonly<Record<string, string>> = {
  Find: "Rechercher",
  Replace: "Remplacer",
  next: "suivant",
  previous: "précédent",
  all: "tout",
  "match case": "respecter la casse",
  regexp: "expression régulière",
  "by word": "mot entier",
  replace: "remplacer",
  "replace all": "tout remplacer",
  close: "fermer",
  "current match": "occurrence en cours",
  "replaced $ matches": "occurrences remplacées : $",
  "replaced match on line $": "occurrence remplacée à la ligne $",
  "on line": "à la ligne",
  "Go to line": "Aller à la ligne",
  go: "aller",
};

/** Ouvre le panneau, le curseur dans le champ de remplacement. */
const openReplacePanel: Command = (view) => {
  openSearchPanel(view);
  // Stryker disable next-line OptionalChaining: le panneau vient d'être ouvert ; TypeScript exige le cas contraire.
  view.dom.querySelector<HTMLInputElement>(".cm-search input[name=replace]")?.focus();
  return true;
};

/** Cmd+F rechercher, Cmd+Alt+F remplacer, Cmd+G suivant, Échap fermer. */
export const findReplace = [
  search({ top: true }),
  EditorState.phrases.of(FRENCH),
  keymap.of([{ key: "Mod-Alt-f", run: openReplacePanel }, ...searchKeymap]),
];
