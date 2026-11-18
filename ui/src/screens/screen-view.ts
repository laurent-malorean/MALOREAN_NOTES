import { nameOf } from "../state/folders";
import { type Screen, type Search, searchable } from "../state/screen";
import { type FolderActions, renderFoldersList } from "./folders-list";
import type { Layout } from "./layout";
import { type NoteActions, renderNotesList } from "./notes-list";
import { renderSearchResults } from "./search-results";
import { renderTagFilter, renderTagsList, type TagActions } from "./tags-view";
import { renderTrash, type TrashActions } from "./trash-view";

/** Ce que l'utilisateur peut demander depuis l'espace de travail. */
export type ScreenActions = FolderActions & NoteActions & TrashActions & TagActions;

const TRASH_TITLE = "Corbeille";

/** Le nom du dossier affiché : celui de la bibliothèque pour la racine. */
function folderName(libraryName: string, folder: string): string {
  return folder === "" ? libraryName : nameOf(folder);
}

type LibraryScreen = Extract<Screen, { kind: "library" }>;

/** Le titre de la liste : la corbeille, l'étiquette du filtre ou le dossier affiché. */
function listTitle(screen: LibraryScreen, tag: string | null): string {
  if (screen.trash) return TRASH_TITLE;
  return tag === null ? folderName(screen.library.name, screen.folder) : `#${tag}`;
}

/** La liste des notes : la corbeille, les notes trouvées, ou celles du dossier ou du filtre. */
function renderList(
  layout: Layout,
  screen: LibraryScreen,
  search: Search | null,
  actions: ScreenActions,
) {
  if (screen.trash) {
    renderTrash(layout.notesList, screen.library.name, screen.trash, actions);
  } else if (search) {
    renderSearchResults(
      layout.notesList,
      screen.library.name,
      search.results,
      screen.selected,
      actions,
    );
  } else {
    renderNotesList(layout.notesList, screen.notes, screen.selected, actions);
  }
}

function renderLibrary(layout: Layout, screen: LibraryScreen, actions: ScreenActions) {
  layout.welcome.hidden = true;
  layout.workspace.hidden = false;
  const search = screen.search && searchable(screen.search.query) ? screen.search : null;
  // Le filtre se voit quand la liste montre ses notes : ni recherche, ni corbeille.
  const tag = screen.trash || search ? null : screen.tag;
  layout.libraryName.textContent = listTitle(screen, tag);
  renderFoldersList(
    layout.foldersList,
    screen.library.name,
    screen.folders,
    screen.trash || screen.tag !== null ? null : screen.folder,
    actions,
    screen.folded,
  );
  renderTagsList(layout.tagsList, screen.tags, tag, actions.selectTag);
  renderTagFilter(layout.tagFilter, tag, actions.clearTag);
  layout.trashButton.classList.toggle("selected", screen.trash !== null);
  // Remettre la même valeur ne déplace pas le curseur du champ.
  layout.searchField.value = screen.search?.query ?? "";
  renderList(layout, screen, search, actions);
}

/** Met la fenêtre en accord avec l'état de l'écran ; chaque cas est traité. */
export function renderScreen(layout: Layout, screen: Screen, actions: ScreenActions): void {
  switch (screen.kind) {
    case "welcome":
      layout.welcome.hidden = false;
      layout.workspace.hidden = true;
      return;
    case "library":
      return renderLibrary(layout, screen, actions);
    // Stryker disable all: cas impossible, le compilateur vérifie que tous les cas sont traités.
    /* istanbul ignore next -- cas impossible : le compilateur vérifie que tous les cas sont traités */
    default: {
      const unhandled: never = screen;
      return unhandled;
    }
    // Stryker restore all
  }
}
