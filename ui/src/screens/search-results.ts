import type { SearchResultItem } from "../bridge";
import { type NoteOpening, openOnClick } from "./note-menu";

const NOTHING_FOUND = "Aucune note trouvée";
const SEARCHING = "Recherche…";
const FOLDER_SEPARATOR = " / ";

function message(text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = "search-message";
  element.textContent = text;
  return element;
}

function excerpt(result: SearchResultItem): HTMLElement {
  const element = document.createElement("span");
  element.className = "search-excerpt";
  element.append(
    ...result.excerpt.map((part) => {
      if (!part.matched) return document.createTextNode(part.text);
      const mark = document.createElement("mark");
      mark.textContent = part.text;
      return mark;
    }),
  );
  return element;
}

function line(className: string, text: string): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

/**
 * Affiche les notes trouvées (titre, dossier, extrait aux mots surlignés) ; un clic ouvre la note,
 * un Cmd+clic l'ouvre dans un nouvel onglet.
 * `null` : aucune réponse encore.
 */
export function renderSearchResults(
  container: HTMLElement,
  workspaceName: string,
  results: readonly SearchResultItem[] | null,
  selected: string | null,
  actions: NoteOpening,
): void {
  if (results === null) return container.replaceChildren(message(SEARCHING));
  if (results.length === 0) return container.replaceChildren(message(NOTHING_FOUND));
  container.replaceChildren(
    ...results.map((result) => {
      const item = document.createElement("button");
      item.className = "search-result";
      item.classList.toggle("selected", result.path === selected);
      const folder =
        result.folder === "" ? workspaceName : result.folder.replaceAll("/", FOLDER_SEPARATOR);
      item.append(line("note-title", result.title), line("search-folder", folder), excerpt(result));
      openOnClick(item, result.path, actions);
      return item;
    }),
  );
}
