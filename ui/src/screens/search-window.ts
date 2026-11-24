// La fenêtre de recherche : les résultats d'une recherche en deux colonnes, « Recherche match » (les
// mots tapés) et « Recherche idées » (le sens), posée sous le champ de recherche (doc/specs/recherche-en-fenetre.md).
import { meaningNotice, modelMissing } from "../state/meaning";
import type { Search } from "../state/screen";
import type { Layout } from "./layout";
import { message, renderSearchResults, type SearchResultActions } from "./search-results";

/** Ce que la fenêtre peut demander : ce que demande un résultat, fermer la recherche, ouvrir Réglages > Index. */
export interface SearchWindowActions extends SearchResultActions {
  readonly closeSearch: () => void;
  readonly openIndexSettings: () => void;
}

/** Espace, en pixels, entre le champ de recherche et la fenêtre. */
const SPACE_UNDER_FIELD = 24;

/** Marge, en pixels, entre le bas de la fenêtre et le bas de l'écran. */
const SPACE_AT_BOTTOM = 24;

/** Le bouton qui mène au téléchargement du modèle, quand c'est lui qui manque. */
const INDEX_SETTINGS_LABEL = "Ouvrir Réglages > Index";

/** Pourquoi le sens n'a pas répondu, et, si le modèle manque, comment le télécharger. */
function ideasNotice(text: string, missing: boolean, actions: SearchWindowActions): HTMLElement[] {
  const notice = message(text);
  notice.classList.add("search-notice");
  notice.setAttribute("role", "note");
  if (!missing) return [notice];
  const button = document.createElement("button");
  button.className = "tool search-index-settings";
  button.textContent = INDEX_SETTINGS_LABEL;
  button.addEventListener("click", () => actions.openIndexSettings());
  return [notice, button];
}

/** La colonne « idées » : les notes proches par le sens, ou la raison pour laquelle il n'y en a pas. */
function renderIdeas(
  container: HTMLElement,
  workspaceName: string,
  ideas: Search["ideas"],
  selected: string | null,
  actions: SearchWindowActions,
): void {
  const reason = meaningNotice(ideas?.meaning);
  if (ideas === undefined)
    return renderSearchResults(container, workspaceName, null, selected, actions);
  if (reason !== null) {
    return container.replaceChildren(...ideasNotice(reason, modelMissing(ideas.meaning), actions));
  }
  renderSearchResults(container, workspaceName, ideas.results, selected, actions);
}

/** Montre la fenêtre avec les deux colonnes de la recherche ; la ferme quand il n'y a plus de recherche. */
export function renderSearchWindow(
  layout: Pick<Layout, "searchWindow" | "searchField" | "matchResults" | "ideasResults">,
  workspaceName: string,
  search: Search | null,
  selected: string | null,
  actions: SearchWindowActions,
): void {
  const { searchWindow: window } = layout;
  if (search === null) {
    layout.matchResults.replaceChildren();
    layout.ideasResults.replaceChildren();
    if (window.open) window.close();
    return;
  }
  renderSearchResults(layout.matchResults, workspaceName, search.results, selected, actions);
  renderIdeas(layout.ideasResults, workspaceName, search.ideas, selected, actions);
  if (window.open) return;
  // Sous le champ, où que la bande du haut le range (elle passe à la ligne en fenêtre étroite).
  const top = layout.searchField.getBoundingClientRect().bottom + SPACE_UNDER_FIELD;
  window.style.top = `${top}px`;
  // Elle descend jusqu'en bas de l'écran, en laissant une marge.
  window.style.height = `calc(100vh - ${top}px - ${SPACE_AT_BOTTOM}px)`;
  // `show` donne le focus à la fenêtre ; le champ garde le sien pour qu'on continue de taper.
  const typing = document.activeElement as HTMLElement;
  window.show();
  typing.focus();
}

/** Relie la fermeture : la croix, Échap dans la fenêtre, un clic en dehors (ni la fenêtre, ni le champ, ni un menu). */
export function connectSearchWindow(
  layout: Pick<Layout, "searchWindow" | "searchField" | "searchClose">,
  close: () => void,
): void {
  const { searchWindow: window, searchField: field, searchClose } = layout;
  searchClose.addEventListener("click", close);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!window.open) return;
    const target = event.target as Element;
    const inside = window.contains(target) || field.contains(target);
    if (!inside && target.closest('[role="menu"]') === null) close();
  });
}
