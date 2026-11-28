// Cahier de recherche (fiches 0041 et 0095) : ce que l'interface calcule pour montrer une entrée.
import { titleFromPath } from "./claude-input-bar";

/** Le numéro d'entrée tel qu'on l'écrit : 4 chiffres (`0007`), le nombre entier au-delà de 9999. */
export function formatEntryNumber(number: number): string {
  return String(number).padStart(4, "0");
}

/** La référence copiée d'une entrée : un lien entre notes avec ancre, le titre du cahier puis son numéro (`[[Levures#0007]]`). */
export function entryReference(title: string, number: number): string {
  return `[[${title}#${formatEntryNumber(number)}]]`;
}

/** Le titre du cahier : son premier titre `#` après l'en-tête, sinon le nom de son fichier sans `.md`. */
export function notebookTitle(content: string, path: string): string {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
  return /^#[ \t]+(.+)$/m.exec(body)?.[1]?.trim() ?? titleFromPath(path);
}

/** Où commence la ligne `line` (à partir de 0) du texte ; sa fin s'il a moins de lignes. */
export function lineStart(content: string, line: number): number {
  let position = 0;
  for (let index = 0; index < line; index++) {
    const next = content.indexOf("\n", position);
    if (next === -1) return content.length;
    position = next + 1;
  }
  return position;
}
