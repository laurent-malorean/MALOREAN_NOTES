// Le choix du mode de recherche, sous le champ : par les mots ou par le sens ; quand le sens manque,
// pourquoi, comment télécharger le modèle (avec sa progression), et où en est le calcul.
import { type SearchMode, type SearchModeView, SEARCH_MODES } from "../state/meaning";
import { downloadProgress } from "./download-progress";

/** Ce que le choix du mode peut demander. */
export interface SearchModeActions {
  choose(mode: SearchMode): void;
  download(model: string): void;
  cancelDownload(): void;
}

function note(className: string, text: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function choice(view: SearchModeView, actions: SearchModeActions): HTMLElement {
  const group = document.createElement("div");
  group.className = "search-mode-choice";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Mode de recherche");
  group.append(
    ...SEARCH_MODES.map(({ mode, label }) => {
      const button = document.createElement("button");
      button.className = "search-mode-button";
      button.textContent = label;
      button.setAttribute("aria-pressed", String(mode === view.mode));
      button.disabled = mode === "meaning" && !view.meaningAvailable;
      button.addEventListener("click", () => actions.choose(mode));
      return button;
    }),
  );
  return group;
}

/** Montre le choix du mode de recherche et, sous lui, ce que le sens demande encore. */
export function renderSearchMode(
  container: HTMLElement,
  view: SearchModeView,
  actions: SearchModeActions,
): void {
  const parts: HTMLElement[] = [choice(view, actions)];
  if (view.explanation !== null) parts.push(note("search-mode-note", view.explanation));
  if (view.offer !== null) {
    const { label, model } = view.offer;
    const offer = document.createElement("button");
    offer.className = "tool search-mode-download";
    offer.textContent = label;
    offer.addEventListener("click", () => actions.download(model));
    parts.push(offer);
  }
  if (view.download !== null) parts.push(downloadProgress(view.download, actions.cancelDownload));
  if (view.compute !== null) parts.push(note("search-mode-note", view.compute));
  container.replaceChildren(...parts);
}
