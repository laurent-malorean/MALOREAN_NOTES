import type { SearchResultItem } from "../bridge";
import { placeLabel } from "../state/content-type";
import { showContextMenu } from "./context-menu";
import { type NoteOpening, noteMenu, openOnClick } from "./note-menu";

/** Ce qu'une note trouvée peut demander : l'ouvrir, ici ou ailleurs, ou fermer son onglet. */
export interface SearchResultActions extends NoteOpening {
  readonly closeNote: (path: string) => void;
}

const NOTHING_FOUND = "Aucune note trouvée";
const SEARCHING = "Recherche…";
const FOLDER_SEPARATOR = " / ";

function message(text: string): HTMLElement {
  const element = document.createElement("p");
  element.className = "search-message";
  element.textContent = text;
  return element;
}

/** Pourquoi le sens n'a pas servi, au-dessus des résultats : ce qu'il manque et quoi faire. */
function notice(text: string): HTMLElement {
  const element = message(text);
  element.classList.add("search-notice");
  element.setAttribute("role", "note");
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

/** Le dossier de l'élément trouvé et, discret à sa droite, son type de contenu suivi du titre de son conteneur. */
function place(folder: string, result: SearchResultItem): HTMLElement {
  const element = document.createElement("span");
  element.className = "search-place";
  element.append(
    line("search-folder", folder),
    line("search-type", placeLabel(result.contentType, result.containerTitle)),
  );
  return element;
}

/**
 * Affiche les notes trouvées (titre, dossier, type de contenu, extrait aux mots surlignés) ; un clic ouvre la note,
 * un Cmd+clic l'ouvre dans un nouvel onglet, un clic droit propose le menu d'une note.
 * `null` : aucune réponse encore. `meaningNotice` : ce que dit la recherche par le sens quand le sens manque.
 */
export function renderSearchResults(
  container: HTMLElement,
  workspaceName: string,
  results: readonly SearchResultItem[] | null,
  selected: string | null,
  actions: SearchResultActions,
  meaningNotice: string | null = null,
): void {
  if (results === null) return container.replaceChildren(message(SEARCHING));
  const notices = meaningNotice === null ? [] : [notice(meaningNotice)];
  if (results.length === 0) {
    return container.replaceChildren(...notices, message(NOTHING_FOUND));
  }
  container.replaceChildren(
    ...notices,
    ...results.map((result) => {
      const item = document.createElement("button");
      item.className = "search-result";
      item.classList.toggle("selected", result.path === selected);
      const folder =
        result.folder === "" ? workspaceName : result.folder.replaceAll("/", FOLDER_SEPARATOR);
      item.append(line("note-title", result.title), place(folder, result), excerpt(result));
      openOnClick(item, result.path, actions, result.node);
      item.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const entries = noteMenu({
          place: (placement) => actions.place(result.path, placement),
          close: () => actions.closeNote(result.path),
        });
        showContextMenu(event.clientX, event.clientY, entries);
      });
      return item;
    }),
  );
}
