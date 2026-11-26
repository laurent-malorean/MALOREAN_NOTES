import type { SearchResultItem } from "../bridge";
import { placeLabel } from "../state/content-type";
import { type ResultSection, resultSections, sectionTitle } from "../state/result-sections";
import { showContextMenu } from "./context-menu";
import {
  type NoteOpening,
  type NoteRenaming,
  noteMenu,
  openOnClick,
  withRename,
} from "./note-menu";

/** Ce qu'une note trouvée peut demander : l'ouvrir, ici ou ailleurs, ou fermer son onglet. */
export interface SearchResultActions extends NoteOpening {
  readonly closeNote: (path: string) => void;
  /** Renommer la note par son menu ; sans lui, le menu n'a pas « Renommer… ». */
  readonly renaming?: NoteRenaming;
}

const NOTHING_FOUND = "Aucune note trouvée";
const SEARCHING = "Recherche…";
const FOLDER_SEPARATOR = " / ";

export function message(text: string): HTMLElement {
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
 * Affiche les résultats trouvés en sections (Canvas, Cartes mentales, Cahiers de recherche, CRM, Notes ; fiche 0093),
 * chacun avec titre, dossier, type de contenu, extrait aux mots surlignés ; un clic ouvre la note,
 * un Cmd+clic l'ouvre dans un nouvel onglet, un clic droit propose le menu d'une note.
 * `null` : aucune réponse encore.
 */
export function renderSearchResults(
  container: HTMLElement,
  workspaceName: string,
  results: readonly SearchResultItem[] | null,
  selected: string | null,
  actions: SearchResultActions,
): void {
  if (results === null) return container.replaceChildren(message(SEARCHING));
  if (results.length === 0) return container.replaceChildren(message(NOTHING_FOUND));
  container.replaceChildren(
    ...resultSections(results).map((section) =>
      sectionElement(section, workspaceName, selected, actions),
    ),
  );
}

/** Une section : son titre (un repère, ni bouton ni focalisable) puis ses résultats, dans un groupe nommé. */
function sectionElement(
  section: ResultSection,
  workspaceName: string,
  selected: string | null,
  actions: SearchResultActions,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "search-section";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", sectionTitle(section));
  const title = document.createElement("h3");
  title.className = "search-section-title";
  // Le groupe porte déjà le titre : le lecteur d'écran ne le lit pas deux fois.
  title.setAttribute("aria-hidden", "true");
  title.textContent = sectionTitle(section);
  group.append(
    title,
    ...section.results.map((result) => resultElement(result, workspaceName, selected, actions)),
  );
  return group;
}

/** Un résultat : titre, dossier, type de contenu, extrait ; ouvre la note, ou propose son menu. */
function resultElement(
  result: SearchResultItem,
  workspaceName: string,
  selected: string | null,
  actions: SearchResultActions,
): HTMLElement {
  const item = document.createElement("button");
  item.className = "search-result";
  item.classList.toggle("selected", result.path === selected);
  const folder =
    result.folder === "" ? workspaceName : result.folder.replaceAll("/", FOLDER_SEPARATOR);
  item.append(line("note-title", result.title), place(folder, result), excerpt(result));
  openOnClick(item, result.path, actions, result.node);
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const { clientX, clientY } = event;
    withRename(result.path, actions.renaming, (rename) => {
      const entries = noteMenu({
        place: (placement) => actions.place(result.path, placement),
        close: () => actions.closeNote(result.path),
        rename,
      });
      showContextMenu(clientX, clientY, entries);
    });
  });
  return item;
}
