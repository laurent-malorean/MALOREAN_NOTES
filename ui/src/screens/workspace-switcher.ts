// Sélecteur d'espace de travail : le nom de l'espace ouvert, en tête de la liste des dossiers et en
// barre à son pied ; un clic ouvre le menu des espaces de travail, sous le nom en tête, au-dessus de la barre au pied.
import { type MenuEntry, showContextMenu } from "./context-menu";

/** Entre la barre du pied et son menu ouvert au-dessus, en pixels. */
const GAP = 4;

/**
 * Branche le sélecteur : `entries` donne le menu à chaque clic, `error` reçoit un échec. Le menu
 * s'ouvre `below` le bouton (en tête) ou `above` (barre du pied, qu'il égale en largeur).
 */
export function connectWorkspaceSwitcher(
  button: HTMLButtonElement,
  entries: () => Promise<readonly MenuEntry[]>,
  error: (reason: unknown) => void,
  placement: "below" | "above" = "below",
): void {
  button.addEventListener("click", () => {
    const box = button.getBoundingClientRect();
    entries()
      .then((list) =>
        placement === "above"
          ? showContextMenu(box.left, box.top - GAP, list, undefined, {
              above: true,
              minWidth: box.width,
              focus: true,
              opener: button,
            })
          : showContextMenu(box.left, box.bottom, list, undefined, { focus: true, opener: button }),
      )
      .catch(error);
  });
}
