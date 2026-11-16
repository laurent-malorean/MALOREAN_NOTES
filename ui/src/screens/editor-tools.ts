// Outils posés sur l'éditeur : bouton du mode focus.
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
