// Raccourcis de mise en forme : chaque commande transforme le texte autour de la sélection.
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

const STAR = "*";

/** Nombre de `*` collés juste avant `from` et juste après `to` (le plus petit des deux). */
function starsAround(state: EditorState, from: number, to: number): number {
  let before = 0;
  while (state.sliceDoc(from - before - 1, from - before) === STAR) before++;
  let after = 0;
  while (state.sliceDoc(to + after, to + after + 1) === STAR) after++;
  return Math.min(before, after);
}

/**
 * Gras (2 étoiles) ou italique (1 étoile) autour de la sélection : ajoutés s'ils n'y sont pas,
 * retirés s'ils y sont. Sans sélection, la paire est insérée et le curseur placé au milieu.
 * Les étoiles autour comptent ainsi : 1 italique, 2 gras, 3 les deux.
 */
export function toggleEmphasis(state: EditorState, width: 1 | 2): TransactionSpec {
  const { from, to } = state.selection.main;
  const stars = starsAround(state, from, to);
  const present = width === 1 ? stars === 1 || stars === 3 : stars >= 2;
  const mark = STAR.repeat(width);
  if (present) {
    return {
      changes: [
        { from: from - width, to: from },
        { from: to, to: to + width },
      ],
      selection: EditorSelection.range(from - width, to - width),
    };
  }
  return {
    changes: [
      { from, insert: mark },
      { from: to, insert: mark },
    ],
    selection: EditorSelection.range(from + width, to + width),
  };
}

const URL_PLACEHOLDER = "url";

/** La sélection devient le texte d'un lien, l'adresse à taper sélectionnée ; sans sélection, le curseur va entre crochets. */
export function makeLink(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const text = state.sliceDoc(from, to);
  const insert = `[${text}](${URL_PLACEHOLDER})`;
  const urlFrom = from + text.length + "[](".length;
  return {
    changes: { from, to, insert },
    selection:
      text === ""
        ? EditorSelection.cursor(from + 1)
        : EditorSelection.range(urlFrom, urlFrom + URL_PLACEHOLDER.length),
  };
}

const HEADING = /^(#{1,6}) /;
const BULLET = /^(\s*)[-*+] (?!\[)/;
const NUMBERED = /^(\s*)\d+[.)] /;
const ITEM = /^(\s*)(?:[-*+]|\d+[.)]) /;

/** Les lignes touchées par la sélection. */
function selectedLines(state: EditorState) {
  const { from, to } = state.selection.main;
  const lines = [];
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) {
    lines.push(state.doc.line(n));
  }
  return lines;
}

/** Les lignes deviennent des titres de ce niveau ; un titre déjà de ce niveau redevient du texte. */
export function setHeading(state: EditorState, level: number): TransactionSpec {
  const lines = selectedLines(state);
  // Stryker disable next-line OptionalChaining: un titre reconnu a toujours ses dièses ; TypeScript exige le cas contraire.
  const same = lines.every((line) => HEADING.exec(line.text)?.[1]?.length === level);
  return {
    changes: lines.map((line) => {
      const current = HEADING.exec(line.text)?.[0] ?? "";
      return {
        from: line.from,
        to: line.from + current.length,
        insert: same ? "" : `${"#".repeat(level)} `,
      };
    }),
  };
}

/** Les deux sortes de listes : comment reconnaître une ligne, quelle marque lui donner. */
const LISTS = {
  bullet: { pattern: BULLET, marker: () => "- " },
  numbered: { pattern: NUMBERED, marker: (index: number) => `${index + 1}. ` },
} as const;

/** Puces ou numéros sur les lignes ; retirés si toutes les lignes en ont déjà. */
export function toggleList(state: EditorState, kind: keyof typeof LISTS): TransactionSpec {
  const lines = selectedLines(state);
  const { pattern, marker } = LISTS[kind];
  const all = lines.every((line) => pattern.test(line.text));
  return {
    changes: lines.map((line, index) => {
      const existing = ITEM.exec(line.text);
      const indent = existing?.[1] ?? "";
      return {
        from: line.from,
        to: line.from + (existing?.[0].length ?? 0),
        insert: all ? indent : `${indent}${marker(index)}`,
      };
    }),
  };
}

const command =
  (transform: (state: EditorState) => TransactionSpec): Command =>
  (view) => {
    view.dispatch(view.state.update(transform(view.state), { scrollIntoView: true }));
    return true;
  };

/** Cmd+B gras, Cmd+I italique, Cmd+K lien, Cmd+1 à 3 titres, Cmd+Maj+8 puces, Cmd+Maj+7 numéros. */
export const formattingShortcuts = keymap.of([
  { key: "Mod-b", run: command((s) => toggleEmphasis(s, 2)) },
  { key: "Mod-i", run: command((s) => toggleEmphasis(s, 1)) },
  { key: "Mod-k", run: command(makeLink) },
  { key: "Mod-1", run: command((s) => setHeading(s, 1)) },
  { key: "Mod-2", run: command((s) => setHeading(s, 2)) },
  { key: "Mod-3", run: command((s) => setHeading(s, 3)) },
  { key: "Mod-Shift-8", run: command((s) => toggleList(s, "bullet")) },
  { key: "Mod-Shift-7", run: command((s) => toggleList(s, "numbered")) },
]);
