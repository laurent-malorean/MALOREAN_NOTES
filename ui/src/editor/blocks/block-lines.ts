// Lignes d'une note, vues comme un tableau de chaînes : ce dont le déplacement et l'ajout d'un bloc ont besoin.
import type { ListItemInfo } from "./read-blocks";

export const isBlank = (line: string): boolean => line.trim() === "";
export const blankLines = (count: number): string[] => Array.from({ length: count }, () => "");

export function trimEnd(lines: readonly string[]): string[] {
  let end = lines.length;
  while (end > 0 && isBlank(lines[end - 1] as string)) end--;
  return lines.slice(0, end);
}

export function trimStart(lines: readonly string[]): string[] {
  let start = 0;
  while (start < lines.length && isBlank(lines[start] as string)) start++;
  return lines.slice(start);
}

/** Les lignes décalées de `delta` caractères de retrait (les lignes vides ne bougent pas). */
export function reindented(lines: readonly string[], delta: number): string[] {
  if (delta === 0) return [...lines];
  return lines.map((line) => {
    if (isBlank(line)) return line;
    if (delta > 0) return " ".repeat(delta) + line;
    const blanks = /^\s*/.exec(line)?.[0].length ?? 0;
    return line.slice(Math.min(blanks, -delta));
  });
}

/** La ligne avec le numéro de sa marque remplacé. */
export function withNumber(line: string, list: ListItemInfo, number: number): string {
  return line.slice(0, list.indent) + String(number) + line.slice(list.indent + list.digits);
}

export function offsetOf(lines: readonly string[], line: number): number {
  return lines.slice(0, line).reduce((total, text) => total + text.length + 1, 0);
}
