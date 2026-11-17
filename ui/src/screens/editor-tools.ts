// Outils posés sur l'éditeur : boutons du mode focus, du mode machine à écrire et du plein écran.
import type { FocusUnit } from "../editor/focus/focus-range";
import type { Typewriter } from "../editor/writing/typewriter";

const FOCUS_LABELS: Readonly<Record<FocusUnit, string>> = {
  sentence: "Focus : phrase",
  paragraph: "Focus : paragraphe",
};

/** Le bouton dit le mode focus en cours. */
export function showFocusUnit(button: HTMLElement, unit: FocusUnit | null): void {
  button.textContent = unit ? FOCUS_LABELS[unit] : "Focus";
  button.setAttribute("aria-pressed", String(unit !== null));
}

/** En plein écran, seules les colonnes restent : listes des dossiers et des notes cachées. */
export function showFullScreen(workspace: HTMLElement, button: HTMLElement, on: boolean): void {
  workspace.classList.toggle("full-screen", on);
  button.textContent = on ? "Quitter le plein écran" : "Plein écran";
  button.setAttribute("aria-pressed", String(on));
}

/** Le plan est-il affiché à droite du texte ? */
export type OutlineDisplay = "shown" | "hidden";

/**
 * Montre ou cache le plan ; le texte lui laisse la place. Le plan reste affiché en plein écran
 * s'il l'était : il sert à se déplacer dans le texte, seul à rester à l'écran.
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
