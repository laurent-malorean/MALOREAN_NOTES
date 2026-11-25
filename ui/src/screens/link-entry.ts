// Une ligne de la liste des contenus liables : l'icône de son type, son titre, son dossier.
import type { LinkableItem } from "../bridge";
import { linkIcon } from "../state/link-choice";
import { newContentIcon } from "./new-content-icons";
import type { PickerEntry } from "./picker";

/** Ce que montre la ligne d'un contenu liable : son icône, son titre et son dossier (qui sépare deux contenus de même nom). */
export function linkEntry(item: LinkableItem): PickerEntry {
  return { label: item.title, detail: item.folder, icon: newContentIcon(linkIcon(item)) };
}
