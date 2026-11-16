// Mode focus : le passage mis en avant autour du curseur, phrase ou paragraphe, calculé sans écran.
import type { Line, Text } from "@codemirror/state";

export type FocusUnit = "sentence" | "paragraph";

export interface Range {
  readonly from: number;
  readonly to: number;
}

const BLANK = /^\s*$/;
const HEADING = /^#{1,6}(?:\s|$)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
/**
 * Une fin de phrase suivie d'une espace : ponctuation, puis guillemets ou parenthèses fermants éventuels.
 * La dernière phrase d'un paragraphe finit avec lui, sans qu'il faille la reconnaître.
 */
const SENTENCE_BOUNDARY = /[.!?…](?:[ \u00a0\u202f]*[»"'”’)\]]+)?(?=\s)/gu;
const LAST_WORD = /\p{L}+$/u;
const INITIAL = /^\p{Lu}$/u;
const FIRST_VISIBLE = /\S|$/;
/** Mots suivis d'un point qui ne termine pas la phrase (en minuscules). */
export const ABBREVIATIONS: ReadonlySet<string> = new Set([
  "m",
  "mme",
  "mlle",
  "mm",
  "dr",
  "pr",
  "p",
  "cf",
  "ex",
  "vol",
  "n",
  "st",
  "ste",
  "av",
  "bd",
]);

const isBlank = (line: Line) => BLANK.test(line.text);
const isHeading = (line: Line) => HEADING.test(line.text);
const startsParagraph = (line: Line) => isHeading(line) || LIST_ITEM.test(line.text);

/** Le paragraphe du curseur : lignes non vides voisines ; un titre ou un élément de liste en commence un. */
function paragraph(doc: Text, pos: number): Range {
  let first = doc.lineAt(pos);
  if (isBlank(first)) return { from: pos, to: pos };
  let last = first;
  while (first.number > 1) {
    const previous = doc.line(first.number - 1);
    if (isBlank(previous) || isHeading(previous) || startsParagraph(first)) break;
    first = previous;
  }
  while (last.number < doc.lines) {
    const next = doc.line(last.number + 1);
    if (isBlank(next) || startsParagraph(next) || isHeading(last)) break;
    last = next;
  }
  return { from: first.from, to: last.to };
}

/** Le point en `index` suit une abréviation ou une initiale : il ne termine pas la phrase. */
function isAbbreviation(text: string, index: number): boolean {
  const word = LAST_WORD.exec(text.slice(0, index))?.[0];
  return word !== undefined && (INITIAL.test(word) || ABBREVIATIONS.has(word.toLowerCase()));
}

/** Les fins de phrase d'un paragraphe, dans l'ordre. */
function sentenceEnds(text: string): number[] {
  return [...text.matchAll(SENTENCE_BOUNDARY)]
    .filter((match) => match[0] !== "." || !isAbbreviation(text, match.index))
    .map((match) => match.index + match[0].length);
}

function sentence(doc: Text, pos: number): Range {
  const block = paragraph(doc, pos);
  const text = doc.sliceString(block.from, block.to);
  const offset = pos - block.from;
  const ends = sentenceEnds(text);
  const end = ends.find((e) => e >= offset) ?? text.trimEnd().length;
  const previous = Math.max(0, ...ends.filter((e) => e < offset));
  const start = previous + text.slice(previous, end).search(FIRST_VISIBLE);
  return { from: block.from + start, to: block.from + end };
}

/** Le passage à mettre en avant autour de `pos` : la phrase ou le paragraphe du curseur. */
export function focusRange(doc: Text, pos: number, unit: FocusUnit): Range {
  return unit === "paragraph" ? paragraph(doc, pos) : sentence(doc, pos);
}
