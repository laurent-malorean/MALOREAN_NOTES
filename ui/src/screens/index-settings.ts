// La partie « Index » de l'écran de réglages : l'état de l'index de mots, sa barre et sa reconstruction.
import type { IndexBarView } from "../state/index-status";
import { indexBar } from "./index-bar";

const TITLE = "Index";
const LOADING = "Lecture de l'état de l'index…";
const BAR_NAME = "Index des notes";

function help(text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = "setting-help";
  element.textContent = text;
  return element;
}

/** Le cadre vide de cette partie, que `renderIndexSettings` remplit à chaque changement. */
export function indexSettingsGroup(): HTMLElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "index-settings";
  return fieldset;
}

/**
 * Remplit `fieldset` : la `bar` de l'index (rien tant que le total de notes à indexer est inconnu),
 * les `lines` de l'état (rien tant qu'il est lu) et « Reconstruire l'index ».
 */
export function renderIndexSettings(
  fieldset: HTMLElement,
  lines: readonly string[] | null,
  rebuild: () => void,
  bar: IndexBarView | null = null,
): void {
  const legend = document.createElement("legend");
  legend.textContent = TITLE;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool";
  button.textContent = "Reconstruire l'index";
  button.addEventListener("click", rebuild);
  const progress = bar === null ? [] : [indexBar(BAR_NAME, bar.percent, bar.written)];
  fieldset.replaceChildren(legend, ...progress, ...(lines ?? [LOADING]).map(help), button);
}
