// Outils posés sur l'éditeur : le bloc d'icônes du mode focus, du plan, du mode machine à écrire,
// des panneaux latéraux, du plein écran et de Claude. Un bouton n'a pas de texte : son nom (qui change
// avec son état) est dans son nom accessible et sa bulle d'aide.
import type { FocusUnit } from "../editor/focus/focus-range";
import type { Typewriter } from "../editor/writing/typewriter";
import type { CommandId } from "../state/commands";
import { DISPLAY_TOOLS, displayToolTitle } from "../state/format-bar";
import type { SidePanels } from "../state/side-panels-preference";
import { formatIcon } from "./format-icons";

/** Donne au bouton son nom du moment : nom accessible, et bulle d'aide avec le raccourci de sa commande. */
function nameTool(button: HTMLElement, label: string, command: CommandId): void {
  button.setAttribute("aria-label", label);
  button.title = displayToolTitle(label, command);
}

/** Pose dans le bloc les six boutons-icônes, dans l'ordre ; chacun garde le `data-<clé>` que la fenêtre cherche. */
export function buildDisplayTools(group: HTMLElement): void {
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Affichage");
  group.replaceChildren(
    ...DISPLAY_TOOLS.map(({ key, label, command, icon }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "format-button";
      button.setAttribute(`data-${key}`, "");
      button.setAttribute("aria-pressed", "false");
      button.append(formatIcon(icon));
      nameTool(button, label, command);
      return button;
    }),
  );
}

const FOCUS_LABELS: Readonly<Record<FocusUnit, string>> = {
  sentence: "Focus : phrase",
  paragraph: "Focus : paragraphe",
};

/** Le bouton dit le mode focus en cours. */
export function showFocusUnit(button: HTMLElement, unit: FocusUnit | null): void {
  nameTool(button, unit ? FOCUS_LABELS[unit] : "Focus", "toggle-focus");
  button.setAttribute("aria-pressed", String(unit !== null));
}

/** Le bouton dit si la fenêtre est en plein écran ; la disposition, elle, ne change pas. */
export function showFullScreen(button: HTMLElement, on: boolean): void {
  nameTool(button, on ? "Quitter le plein écran" : "Plein écran", "toggle-full-screen");
  button.replaceChildren(formatIcon(on ? "full-screen-exit" : "full-screen"));
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
