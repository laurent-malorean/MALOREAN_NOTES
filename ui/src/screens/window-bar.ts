// Réserve gauche de la bande du haut (fiche 0098) : la place des trois boutons de fenêtre du Mac, puis le
// bouton des panneaux latéraux, toujours visible, panneaux cachés comme montrés.
import { formatButtonName, formatButtonTitle } from "../state/format-bar";
import type { SidePanels } from "../state/side-panels-preference";
import { appIcon } from "./app-icons";

/** Pose le bouton dans la réserve, qu'on saisit pour déplacer la fenêtre (Tauri lit `data-tauri-drag-region`). */
export function buildWindowBar(left: HTMLElement): void {
  left.setAttribute("data-tauri-drag-region", "");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "window-button";
  button.setAttribute("data-side-panels", "");
  button.setAttribute("aria-label", formatButtonName("toggle-side-panels"));
  button.title = formatButtonTitle("toggle-side-panels");
  paint(button, "shown");
  left.replaceChildren(button);
}

/** Cache ou montre ensemble les listes des dossiers et des notes ; le bouton en dit l'état par son icône. */
export function showSidePanels(
  mainArea: HTMLElement,
  button: HTMLElement,
  panels: SidePanels,
): void {
  mainArea.classList.toggle("panels-hidden", panels === "hidden");
  paint(button, panels);
}

function paint(button: HTMLElement, panels: SidePanels): void {
  button.setAttribute("aria-pressed", String(panels === "shown"));
  button.replaceChildren(appIcon(panels === "shown" ? "side-panels-shown" : "side-panels-hidden"));
}
