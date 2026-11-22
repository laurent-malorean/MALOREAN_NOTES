// Le premier passage d'une note que trouve une recherche : où aller quand on ouvre un résultat.

/** Un passage du texte : de `from` (compris) à `to` (exclu), en positions du texte d'origine. */
export interface Span {
  readonly from: number;
  readonly to: number;
}

/** Sans accents ni majuscules, comme l'index. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Le passage de `text` où paraît le premier des mots de `query`, sans tenir compte des
 * majuscules ni des accents ; rien si aucun n'y paraît.
 */
export function firstMatch(text: string, query: string): Span | null {
  const starts: number[] = [];
  const ends: number[] = [];
  let folded = "";
  let at = 0;
  for (const char of text) {
    const plain = fold(char);
    for (let i = 0; i < plain.length; i++) {
      starts.push(at);
      ends.push(at + char.length);
    }
    folded += plain;
    at += char.length;
  }
  let best: Span | null = null;
  for (const [word] of fold(query).matchAll(/\S+/g)) {
    const index = folded.indexOf(word);
    if (index < 0) continue;
    const from = starts[index] as number;
    if (best === null || from < best.from) {
      best = { from, to: ends[index + word.length - 1] as number };
    }
  }
  return best;
}
