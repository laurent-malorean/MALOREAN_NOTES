// Comptes d'une note : mots, caractères et pages, sur le texte tel qu'on le lit.
import { withoutFrontMatter } from "../front-matter";

export interface Counts {
  readonly words: number;
  readonly characters: number;
}

/** Ce qui se lit d'une ligne une fois la syntaxe Markdown retirée. */
const LINE_MARKS: readonly (readonly [RegExp, string])[] = [
  [/^\s*#{1,6}\s+/, ""], // titre
  [/^\s*(?:>\s?)+/, ""], // citation, même imbriquée
  [/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ""], // puce, numéro, case
  [/^\s*(?:`{3,}|~{3,}).*/, ""], // délimiteur de bloc de code, et sa langue
  [/^\s*-{3,}\s*$/, ""], // séparateur (`***` et `___` partent avec les marques ci-dessous)
  [/!?\[([^\]]*)\]\([^)]*\)/g, "$1"], // lien ou image : son texte seulement
  [/[*_`]|~~/g, ""], // gras, italique, code, barré
];

/**
 * Le texte tel qu'on le lit : sans en-tête YAML ni marques Markdown (titres, puces, gras,
 * adresses des liens…). Les retours à la ligne restent, pour séparer les mots.
 */
export function readableText(markdown: string): string {
  return withoutFrontMatter(markdown)
    .split("\n")
    .map((line) => LINE_MARKS.reduce((text, [mark, by]) => text.replace(mark, by), line))
    .join("\n");
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Mots et caractères d'un texte. Un mot est une suite sans espace qui contient au moins une
 * lettre ou un chiffre (« l'été » et « porte-monnaie » comptent pour un). Les caractères
 * comptent les espaces mais pas les retours à la ligne, et un accent compte avec sa lettre.
 */
export function countText(text: string): Counts {
  const words = text.split(/\s/).filter((word) => LETTER_OR_DIGIT.test(word)).length;
  const characters = [...text.normalize("NFC").replace(/\r?\n/g, "")].length;
  return { words, characters };
}

const number = new Intl.NumberFormat("fr-FR");

/**
 * « 1 234 mots · 5 678 caractères · 4 pages », une page comptant `charactersPerPage`
 * caractères : on compte les pages commencées ; « page » au singulier en dessous de 2.
 */
export function describeCounts({ words, characters }: Counts, charactersPerPage: number): string {
  const pageCount = Math.ceil(characters / charactersPerPage);
  const plural = (n: number, word: string) => `${word}${n >= 2 ? "s" : ""}`;
  return [
    `${number.format(words)} ${plural(words, "mot")}`,
    `${number.format(characters)} ${plural(characters, "caractère")}`,
    `${number.format(pageCount)} ${plural(pageCount, "page")}`,
  ].join(" · ");
}
