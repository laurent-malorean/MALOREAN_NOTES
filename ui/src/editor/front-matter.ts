// En-tête YAML d'une note, tel que l'éditeur le reconnaît : en tout début de note, fermé tôt.
import type { Text } from "@codemirror/state";

/** Un en-tête doit se fermer dans ces premiers caractères : au-delà, ce n'en est pas un. */
const SCAN_LIMIT = 10_000;
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Où finit l'en-tête YAML de la note (son `---` de fermeture compris) ; 0 s'il n'y en a pas. */
export function frontMatterEnd(doc: Text): number {
  const header = FRONT_MATTER.exec(doc.sliceString(0, Math.min(doc.length, SCAN_LIMIT)));
  return header ? header[0].trimEnd().length : 0;
}

/** Le texte sans son en-tête YAML. */
export function withoutFrontMatter(markdown: string): string {
  return markdown.slice(FRONT_MATTER.exec(markdown.slice(0, SCAN_LIMIT))?.[0].length ?? 0);
}
