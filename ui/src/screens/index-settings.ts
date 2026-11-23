// La partie « Index » de l'écran de réglages : l'état de l'index de mots et sa reconstruction.

const TITLE = "Index";
const LOADING = "Lecture de l'état de l'index…";

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

/** Remplit `fieldset` : les `lines` de l'état (rien tant qu'il est lu) et « Reconstruire l'index ». */
export function renderIndexSettings(
  fieldset: HTMLElement,
  lines: readonly string[] | null,
  rebuild: () => void,
): void {
  const legend = document.createElement("legend");
  legend.textContent = TITLE;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool";
  button.textContent = "Reconstruire l'index";
  button.addEventListener("click", rebuild);
  fieldset.replaceChildren(legend, ...(lines ?? [LOADING]).map(help), button);
}
