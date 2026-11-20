// Cahier de recherche (fiche 0041) : ce que l'interface calcule pour montrer une entrée.

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
