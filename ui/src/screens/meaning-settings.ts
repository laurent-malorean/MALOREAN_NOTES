// La partie « Recherche par le sens » de l'écran de réglages : les modèles, l'index de sens et sa reconstruction.
import type { ModelRow } from "../state/meaning";
import { downloadProgress } from "./download-progress";

/** Ce que les réglages du sens peuvent demander. */
export interface MeaningSettingsActions {
  choose(model: string): void;
  download(model: string): void;
  cancelDownload(): void;
  remove(model: string, label: string): void;
  rebuild(): void;
}

/** Ce que les réglages du sens montrent. */
export interface MeaningSettingsView {
  readonly rows: readonly ModelRow[];
  readonly lines: readonly string[];
}

const TITLE = "Recherche par le sens";
const LOADING = "Lecture de l'état du sens…";
const REBUILD = "Reconstruire l'index de sens";

function text(tag: "span" | "p", className: string, content: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = content;
  return element;
}

function button(label: string, name: string, act: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "tool";
  element.textContent = label;
  element.setAttribute("aria-label", `${label} « ${name} »`);
  element.addEventListener("click", act);
  return element;
}

/** Le bouton ou la progression qui suit un modèle : télécharger, annuler, ou supprimer. */
function action(row: ModelRow, actions: MeaningSettingsActions): HTMLElement {
  if (row.progress !== null) return downloadProgress(row.progress, actions.cancelDownload);
  if (row.downloading) {
    return button("Annuler le téléchargement", row.label, actions.cancelDownload);
  }
  return row.downloaded
    ? button("Supprimer", row.label, () => actions.remove(row.model, row.label))
    : button("Télécharger", row.label, () => actions.download(row.model));
}

function modelLine(row: ModelRow, actions: MeaningSettingsActions): HTMLElement {
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "meaning-model";
  radio.id = `meaning-model-${row.model}`;
  radio.checked = row.used;
  radio.addEventListener("change", () => actions.choose(row.model));
  const label = document.createElement("label");
  label.htmlFor = radio.id;
  label.textContent = row.label;
  const line = document.createElement("div");
  line.className = "meaning-model";
  line.append(radio, label, text("span", "meaning-weight", row.weight));
  line.append(text("span", "meaning-status", row.status));
  if (row.used) line.append(text("span", "meaning-used", "utilisé"));
  line.append(action(row, actions));
  return line;
}

/** Remplit `fieldset` : les modèles, l'état de l'index de sens, et « Reconstruire l'index de sens ». */
export function renderMeaningSettings(
  fieldset: HTMLElement,
  view: MeaningSettingsView,
  actions: MeaningSettingsActions,
): void {
  const legend = document.createElement("legend");
  legend.textContent = TITLE;
  if (view.rows.length === 0)
    return fieldset.replaceChildren(legend, text("p", "setting-help", LOADING));
  const index = document.createElement("div");
  index.className = "meaning-index";
  index.append(...view.lines.map((line) => text("p", "setting-help", line)));
  const rebuild = document.createElement("button");
  rebuild.type = "button";
  rebuild.className = "tool";
  rebuild.textContent = REBUILD;
  rebuild.addEventListener("click", actions.rebuild);
  fieldset.replaceChildren(
    legend,
    ...view.rows.map((row) => modelLine(row, actions)),
    index,
    rebuild,
  );
}

/** Le cadre vide de cette partie, que `renderMeaningSettings` remplit à chaque changement. */
export function meaningSettingsFrame(): HTMLElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "meaning-settings";
  return fieldset;
}
