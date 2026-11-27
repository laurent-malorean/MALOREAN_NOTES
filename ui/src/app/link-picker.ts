// La recherche de contenus à lier : une seule liste de tout ce qu'un lien peut désigner (notes,
// canvas, cartes mentales, cahiers de recherche, CRM), filtrée à chaque lettre. Sert à la fenêtre
// d'une action du CRM (« + Lier une note ») et au bouton « Lien » de la barre de mise en forme.
import type * as Bridge from "../bridge";
import type { LinkableItem } from "../bridge";
import { linkEntry } from "../screens/link-entry";
import { openPicker } from "../screens/picker";
import { matchingLinkable } from "../state/link-choice";

/** Ce que la recherche demande à Rust : tout ce qu'on peut lier. */
export type LinkPickerBackend = Pick<typeof Bridge, "listLinkable">;

/** Ce que la recherche propose : son nom, et ce qu'elle garde de la liste (tout, sans `keep`). */
export interface LinkChoiceOptions {
  readonly label?: string;
  readonly keep?: (item: LinkableItem) => boolean;
}

/** Ouvre la recherche dans la fenêtre de choix `picker` : le contenu choisi, `null` si on annule. */
export async function chooseLinkable(
  backend: LinkPickerBackend,
  picker: HTMLDialogElement,
  { label = "Lier une note", keep = () => true }: LinkChoiceOptions = {},
): Promise<LinkableItem | null> {
  const items = (await backend.listLinkable()).filter(keep);
  return new Promise((resolve) => {
    let chosen = false;
    openPicker(picker, {
      label,
      placeholder: "Nom du contenu",
      empty: "Aucun contenu ne correspond",
      entries: (query) => matchingLinkable(items, query),
      describe: linkEntry,
      choose: (item) => {
        chosen = true;
        resolve(item);
      },
    });
    // Un « close » encore en route de la fenêtre qu'on vient de refermer n'est pas celui-ci.
    const closed = () => {
      if (picker.open) return;
      picker.removeEventListener("close", closed);
      if (!chosen) resolve(null);
    };
    picker.addEventListener("close", closed);
  });
}
