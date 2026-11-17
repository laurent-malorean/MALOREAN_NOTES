// Plan de la note : ses titres, dans l'ordre, pour s'y rendre d'un clic.
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { frontMatterEnd } from "../front-matter";
import { readableText } from "../writing/counts";

/** Un titre de la note : son niveau (1 à 6), son texte lisible, et où il commence. */
export interface Heading {
  readonly level: number;
  readonly text: string;
  readonly from: number;
}

/** Le niveau de chaque sorte de titre : `# Titre` ou titre souligné. */
const HEADING_LEVEL: Readonly<Record<string, number>> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
  SetextHeading1: 1,
  SetextHeading2: 2,
};
/** Dièses de fermeture : `## Titre ##`. */
const CLOSING_HASHES = /\s#+\s*$/;

/**
 * Les titres de la note, au premier niveau du texte : ni dans l'en-tête YAML, ni dans un bloc
 * de code, ni dans une citation ou une liste. Le texte est celui qu'on lit, sans syntaxe.
 */
export function outlineOf(state: EditorState): Heading[] {
  const headerEnd = frontMatterEnd(state.doc);
  const headings: Heading[] = [];
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    const level = HEADING_LEVEL[node.name];
    if (level === undefined || node.from < headerEnd) continue;
    const line = state.doc.lineAt(node.from).text.replace(CLOSING_HASHES, "");
    headings.push({ level, text: readableText(line).trim(), from: node.from });
  }
  return headings;
}
