// Barre de mise en forme : les boutons de la bande du haut qui lancent les commandes de mise en
// forme et de copie sur la note de la colonne active, sans prendre le focus de l'éditeur.
import type { CommandId } from "../state/commands";
import { formatIcon } from "./format-icons";
import { FORMAT_BAR, formatButtonName, formatButtonTitle } from "../state/format-bar";

/** Pose les pilules de boutons dans la barre ; un clic lance la commande du bouton. */
export function buildFormatBar(bar: HTMLElement, run: (command: CommandId) => void): void {
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Mise en forme");
  // Le bouton enfoncé ne prend pas le focus : l'éditeur garde sa sélection et son curseur.
  bar.addEventListener("mousedown", (event) => event.preventDefault());
  bar.replaceChildren(
    ...FORMAT_BAR.map((buttons) => {
      const group = document.createElement("div");
      group.className = "format-group";
      group.setAttribute("role", "group");
      group.append(
        ...buttons.map(({ command, icon }) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "format-button";
          button.dataset.command = command;
          button.append(formatIcon(icon));
          button.setAttribute("aria-label", formatButtonName(command));
          button.title = formatButtonTitle(command);
          button.disabled = true;
          button.addEventListener("click", () => run(command));
          return button;
        }),
      );
      return group;
    }),
  );
}

/** Grise les boutons tant qu'aucune note n'est montrée dans la colonne active. */
export function showNoteShown(bar: HTMLElement, shown: boolean): void {
  for (const button of bar.querySelectorAll("button")) button.disabled = !shown;
}
