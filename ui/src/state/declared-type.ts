// Le type qu'une note déclare dans son en-tête (`type: …`), lu comme Rust le lit : la première clé
// `type:` au premier niveau de l'en-tête, sa valeur jusqu'au commentaire, guillemets permis.

const TYPE_LINE = /^type[ \t]*:([^#\n]*)/m;
const HEADER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const QUOTES = /^["']|["']$/g;

/** Le type déclaré par la note `content`, ou `null` sans en-tête ou sans `type:`. */
export function declaredType(content: string): string | null {
  const header = HEADER.exec(content)?.[1];
  const value = header === undefined ? undefined : TYPE_LINE.exec(header)?.[1];
  return value === undefined ? null : value.trim().replace(QUOTES, "");
}
