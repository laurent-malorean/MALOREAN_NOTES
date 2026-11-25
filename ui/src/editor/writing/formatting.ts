// Mise en forme : chaque commande transforme le texte autour de la sélection ; ses raccourcis
// viennent de la liste des commandes.
import {
  type ChangeSpec,
  ChangeSet,
  EditorSelection,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import { type Command, type EditorView, keymap } from "@codemirror/view";
import type { FormatCommandId } from "../../state/commands";
import { commandKeys } from "./command-keys";

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

/** Les modifications de début de ligne ; un curseur placé à cet endroit se range après ce qui est inséré. */
function atLineStart(state: EditorState, changes: ChangeSpec[]): TransactionSpec {
  const set = ChangeSet.of(changes, state.doc.length);
  return { changes: set, selection: state.selection.map(set, 1) };
}

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
  return atLineStart(
    state,
    lines.map((line) => {
      const current = HEADING.exec(line.text)?.[0] ?? "";
      return {
        from: line.from,
        to: line.from + current.length,
        insert: same ? "" : `${"#".repeat(level)} `,
      };
    }),
  );
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
  return atLineStart(
    state,
    lines.map((line, index) => {
      const existing = ITEM.exec(line.text);
      const indent = existing?.[1] ?? "";
      return {
        from: line.from,
        to: line.from + (existing?.[0].length ?? 0),
        insert: all ? indent : `${indent}${marker(index)}`,
      };
    }),
  );
}

/** Ce que fait chaque commande de mise en forme au texte. */
const FORMATTING: Readonly<Record<FormatCommandId, (state: EditorState) => TransactionSpec>> = {
  bold: (s) => toggleEmphasis(s, 2),
  italic: (s) => toggleEmphasis(s, 1),
  "insert-link": makeLink,
  "heading-1": (s) => setHeading(s, 1),
  "heading-2": (s) => setHeading(s, 2),
  "heading-3": (s) => setHeading(s, 3),
  "bullet-list": (s) => toggleList(s, "bullet"),
  "numbered-list": (s) => toggleList(s, "numbered"),
};

/** Pose la syntaxe d'un lien vers une page web sur la sélection, comme une frappe. */
export function writeWebLink(view: EditorView): void {
  view.dispatch(view.state.update(makeLink(view.state), { scrollIntoView: true }));
}

/**
 * La commande de mise en forme, comme une frappe : signalée, annulable, le texte gardé en vue.
 * « Lien » laisse `chooseLink` demander ce qu'on lie quand l'application le sait (un contenu ou
 * une page web) ; sans lui, c'est un lien vers une page web.
 */
export const formatCommand =
  (id: FormatCommandId, chooseLink?: (view: EditorView) => void): Command =>
  (view) => {
    if (id === "insert-link" && chooseLink) chooseLink(view);
    else view.dispatch(view.state.update(FORMATTING[id](view.state), { scrollIntoView: true }));
    return true;
  };

/** Cmd+B gras, Cmd+I italique, Cmd+K lien, Cmd+1 à 3 titres, Cmd+Maj+8 puces, Cmd+Maj+7 numéros. */
export const formattingShortcuts = (chooseLink?: (view: EditorView) => void) =>
  keymap.of(
    commandKeys(
      Object.fromEntries(
        (Object.keys(FORMATTING) as FormatCommandId[]).map((id) => [
          id,
          formatCommand(id, chooseLink),
        ]),
      ),
    ),
  );
