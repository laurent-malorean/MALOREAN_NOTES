// Le champ d'étiquettes (spécification des contenus : notes, cahiers, cartes mentales, canvas, CRM) :
// ce que l'interface sait d'une liste d'étiquettes sans écran. Rust nettoie et écrit ; ici, la couleur
// d'une pastille et les deux gestes qui préparent la liste à envoyer.
import { PALETTE } from "./palette";

/** Un mot de couleur de la palette, par son nom. */
export type ColorName = (typeof PALETTE)[number];

/** La couleur d'une étiquette, d'après son nom : la somme des codes de son nom en minuscules, modulo 10. */
export function tagColor(tag: string): ColorName {
  let sum = 0;
  for (const letter of tag.toLowerCase()) sum += letter.codePointAt(0) as number;
  return PALETTE[sum % PALETTE.length] as ColorName;
}

/** La liste avec l'étiquette `tag` en plus ; refusée si elle est vide ou déjà là (la casse ne compte pas). */
export function withTag(tags: readonly string[], tag: string): string[] {
  const name = tag.trim();
  const taken = tags.some((t) => t.toLowerCase() === name.toLowerCase());
  return name === "" || taken ? [...tags] : [...tags, name];
}

/** La liste sans l'étiquette `tag`, telle qu'elle est écrite. */
export const withoutTag = (tags: readonly string[], tag: string): string[] =>
  tags.filter((t) => t !== tag);

/** Une étiquette qui existe déjà dans l'espace de travail, avec le nombre de notes qui la portent quand l'application le sait. */
export interface TagSuggestion {
  readonly name: string;
  readonly count?: number;
}

/** Une ligne de la liste du champ : une étiquette qui existe, ou « Créer “mot” » pour ce qui est tapé. */
export interface TagChoice {
  readonly kind: "existing" | "create";
  readonly name: string;
  readonly count?: number;
}

/**
 * Ce que la liste du champ propose pour ce qui est tapé : les étiquettes qui existent et contiennent le texte
 * (la casse et un « # » devant ne comptent pas), sans celles que le contenu
 * porte déjà, celles qui commencent par le texte d'abord ; puis, si le texte n'est pas une étiquette qui
 * existe ou que le contenu porte, « Créer » avec lui.
 */
export function tagChoices(
  suggestions: readonly TagSuggestion[],
  tags: readonly string[],
  typed: string,
): TagChoice[] {
  const text = typed.trim().replace(/^#/, "").trim();
  const needle = text.toLowerCase();
  const carried = new Set(tags.map((tag) => tag.toLowerCase()));
  const found = suggestions.filter(
    ({ name }) => !carried.has(name.toLowerCase()) && name.toLowerCase().includes(needle),
  );
  const starts = found.filter(({ name }) => name.toLowerCase().startsWith(needle));
  const rest = found.filter((suggestion) => !starts.includes(suggestion));
  const choices: TagChoice[] = [...starts, ...rest].map((s) => ({ kind: "existing", ...s }));
  const known = suggestions.some(({ name }) => name.toLowerCase() === needle);
  if (text !== "" && !known && !carried.has(needle)) choices.push({ kind: "create", name: text });
  return choices;
}

/** Le texte du nombre de notes d'une étiquette : « 1 note », « 12 notes ». */
export const noteCount = (count: number): string => `${String(count)} note${count > 1 ? "s" : ""}`;
