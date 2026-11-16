// Tableau Markdown (GitHub) : en-tête, alignement des colonnes et lignes, lus depuis son texte.

export type Alignment = "left" | "center" | "right" | null;

export interface Table {
  readonly header: readonly string[];
  readonly alignments: readonly Alignment[];
  readonly rows: readonly (readonly string[])[];
}

const ESCAPED_BAR = "\\|";
const PLACEHOLDER = "\u0000";

/** Les cellules d'une ligne : barres de bord retirées, barres échappées gardées dans le texte. */
function cells(line: string): string[] {
  let text = line.trim().replaceAll(ESCAPED_BAR, PLACEHOLDER);
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.replaceAll(PLACEHOLDER, "|").trim());
}

function alignment(delimiter: string): Alignment {
  const left = delimiter.startsWith(":");
  const right = delimiter.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return left ? "left" : null;
}

function fitted(row: readonly string[], width: number): string[] {
  return Array.from({ length: width }, (_, i) => row[i] ?? "");
}

/** Le tableau écrit dans `source` : ligne d'en-tête, ligne de séparation, puis les lignes. */
export function parseTable(source: string): Table {
  // Stryker disable next-line StringLiteral: un tableau a toujours son en-tête et sa ligne de séparation ; TypeScript exige le cas contraire.
  const [headerLine = "", delimiterLine = "", ...rowLines] = source.split("\n");
  const header = cells(headerLine);
  return {
    header,
    alignments: fitted(cells(delimiterLine), header.length).map(alignment),
    rows: rowLines.map((line) => fitted(cells(line), header.length)),
  };
}
