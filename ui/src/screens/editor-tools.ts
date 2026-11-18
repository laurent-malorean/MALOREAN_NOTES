// Outils posés sur l'éditeur : boutons du mode focus, du mode machine à écrire, du plein écran
// et des panneaux latéraux.
import type { FocusUnit } from "../editor/focus/focus-range";
import type { Typewriter } from "../editor/writing/typewriter";
import type { SidePanels } from "../state/side-panels-preference";

const FOCUS_LABELS: Readonly<Record<FocusUnit, string>> = {
  sentence: "Focus : phrase",
  paragraph: "Focus : paragraphe",
};

/** Le bouton dit le mode focus en cours. */
export function showFocusUnit(button: HTMLElement, unit: FocusUnit | null): void {
  button.textContent = unit ? FOCUS_LABELS[unit] : "Focus";
  button.setAttribute("aria-pressed", String(unit !== null));
}

/** Le bouton dit si la fenêtre est en plein écran ; la disposition, elle, ne change pas. */
export function showFullScreen(button: HTMLElement, on: boolean): void {
  button.textContent = on ? "Quitter le plein écran" : "Plein écran";
  button.setAttribute("aria-pressed", String(on));
}

/** Cache ou montre ensemble les listes des dossiers et des notes ; les colonnes prennent la place. */
export function showSidePanels(
  mainArea: HTMLElement,
  button: HTMLElement,
  panels: SidePanels,
): void {
  mainArea.classList.toggle("panels-hidden", panels === "hidden");
  button.setAttribute("aria-pressed", String(panels === "shown"));
}

/** Le plan est-il affiché à droite du texte ? */
export type OutlineDisplay = "shown" | "hidden";

/**
 * Montre ou cache le plan ; le texte lui laisse la place. Le plan reste affiché en plein écran
 * s'il l'était : il sert à se déplacer dans le texte.
 */
export function showOutline(
  area: HTMLElement,
  outline: HTMLElement,
  button: HTMLElement,
  display: OutlineDisplay,
): void {
  outline.hidden = display === "hidden";
  area.classList.toggle("outline-open", display === "shown");
  button.setAttribute("aria-pressed", String(display === "shown"));
}

/** Le bouton dit si le mode machine à écrire est en marche. */
export function showTypewriter(button: HTMLElement, mode: Typewriter): void {
  button.setAttribute("aria-pressed", String(mode === "on"));
}
