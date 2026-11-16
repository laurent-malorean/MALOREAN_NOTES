// Outils posés sur l'éditeur : boutons du mode focus et du plein écran.
import type { FocusUnit } from "../editor/focus/focus-range";

const FOCUS_LABELS: Readonly<Record<FocusUnit, string>> = {
  sentence: "Focus : phrase",
  paragraph: "Focus : paragraphe",
};

/** Le bouton dit le mode focus en cours. */
export function showFocusUnit(button: HTMLElement, unit: FocusUnit | null): void {
  button.textContent = unit ? FOCUS_LABELS[unit] : "Focus";
  button.setAttribute("aria-pressed", String(unit !== null));
}

/** En plein écran, seul le texte reste : colonnes des dossiers et des notes cachées. */
export function showFullScreen(workspace: HTMLElement, button: HTMLElement, on: boolean): void {
  workspace.classList.toggle("full-screen", on);
  button.textContent = on ? "Quitter le plein écran" : "Plein écran";
  button.setAttribute("aria-pressed", String(on));
}
