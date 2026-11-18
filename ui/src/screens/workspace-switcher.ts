// Sélecteur d'espace de travail : en tête de la colonne des dossiers, le nom de l'espace ouvert ;
// un clic ouvre, juste en dessous, le menu des espaces de travail.
import { type MenuEntry, showContextMenu } from "./context-menu";

/** Branche le sélecteur : `entries` donne le menu à chaque clic, `error` reçoit un échec. */
export function connectWorkspaceSwitcher(
  button: HTMLButtonElement,
  entries: () => Promise<readonly MenuEntry[]>,
  error: (reason: unknown) => void,
): void {
  button.addEventListener("click", () => {
    const box = button.getBoundingClientRect();
    entries()
      .then((list) => showContextMenu(box.left, box.bottom, list))
      .catch(error);
  });
}
