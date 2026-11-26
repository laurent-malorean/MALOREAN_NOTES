// Barre de la fenêtre : la bande tout en haut, à la place de la barre de titre du Mac. Elle porte, à
// droite des trois boutons de fenêtre du Mac, le bouton des panneaux latéraux, toujours visible.
import { formatButtonName, formatButtonTitle } from "../state/format-bar";
import type { SidePanels } from "../state/side-panels-preference";
import { appIcon } from "./app-icons";

/** Pose le bouton dans la barre, qu'on saisit pour déplacer la fenêtre (Tauri lit `data-tauri-drag-region`). */
export function buildWindowBar(bar: HTMLElement): void {
  bar.setAttribute("data-tauri-drag-region", "");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "window-button";
  button.setAttribute("data-side-panels", "");
  button.setAttribute("aria-label", formatButtonName("toggle-side-panels"));
  button.title = formatButtonTitle("toggle-side-panels");
  paint(button, "shown");
  bar.replaceChildren(button);
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
