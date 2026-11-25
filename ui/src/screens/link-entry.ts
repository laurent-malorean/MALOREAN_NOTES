// Une ligne de la liste des contenus liables : l'icône de son type, son titre, son dossier.
import type { LinkableItem } from "../bridge";
import { linkIcon } from "../state/link-choice";
import { newContentIcon } from "./new-content-icons";
import type { PickerEntry } from "./picker";

/** Le dossier montré pour un contenu de la racine dont le nom est aussi celui d'un autre contenu. */
export const ROOT_FOLDER_LABEL = "Racine";

/**
 * Ce que montre la ligne d'un contenu liable : son icône, son titre et son dossier, qui sépare deux
 * contenus de même nom (leur lien commence alors par le dossier, `/` pour la racine).
 */
export function linkEntry(item: LinkableItem): PickerEntry {
  const root = item.folder === "" && item.link.startsWith("/");
  return {
    label: item.title,
    detail: root ? ROOT_FOLDER_LABEL : item.folder,
    icon: newContentIcon(linkIcon(item)),
  };
}
