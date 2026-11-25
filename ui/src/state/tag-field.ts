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
