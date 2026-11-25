// Ce qui ouvre le menu des liens sous le curseur : `[[` (complétion) ou `/` en début de ligne ou
// après une espace (menu « Lien vers… »). Ce qui est tapé ensuite filtre la liste.

/** Ce qui a ouvert le menu : où il commence dans la ligne, et ce qui est tapé depuis. */
export interface LinkTrigger {
  readonly kind: "brackets" | "slash";
  /** Position, dans la ligne, de `[[` ou de `/`. */
  readonly from: number;
  /** Ce qui est tapé depuis, qui filtre la liste. */
  readonly query: string;
}

const OPENING = "[[";
const SLASH = "/";
/** Ferme la complétion : un lien se termine, ou le texte montré commence. */
const ENDS_LINK = /\]|\|/;

/**
 * Le menu à montrer pour le curseur placé à `column` dans la ligne `line`, ou `null`. Un `[[` non
 * fermé avant le curseur ouvre la complétion ; sinon un `/` en début de ligne ou après une espace
 * ouvre le menu, sauf s'il est suivi d'une espace (« et / ou » n'est pas un lien).
 */
export function linkTrigger(line: string, column: number): LinkTrigger | null {
  const before = line.slice(0, column);
  const opening = before.lastIndexOf(OPENING);
  if (opening !== -1) {
    const query = before.slice(opening + OPENING.length);
    if (!ENDS_LINK.test(query)) return { kind: "brackets", from: opening, query };
  }
  for (let at = before.lastIndexOf(SLASH); at !== -1; at = before.lastIndexOf(SLASH, at - 1)) {
    const previous = before[at - 1];
    if (previous !== undefined && !/\s/.test(previous)) continue;
    const query = before.slice(at + SLASH.length);
    if (/^\s/.test(query)) return null;
    return { kind: "slash", from: at, query };
  }
  return null;
}
