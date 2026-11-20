import { nameOf } from "../state/folders";
import { type Screen, type Search, searchable } from "../state/screen";
import { type FolderActions, renderFoldersList } from "./folders-list";
import type { Layout } from "./layout";
import { type NoteOrderActions, renderNoteOrder } from "./note-order-view";
import { type NoteActions, renderNotesList } from "./notes-list";
import { type RecentActions, renderRecentEntry } from "./recent-view";
import { renderSearchResults } from "./search-results";
import { renderTagFilter, renderTagsList, type TagActions } from "./tags-view";
import { renderTrash, type TrashActions } from "./trash-view";

/** Ce que l'utilisateur peut demander depuis l'espace de travail. */
export type ScreenActions = FolderActions &
  NoteActions &
  TrashActions &
  TagActions &
  NoteOrderActions &
  RecentActions;

const TRASH_TITLE = "Corbeille";
const RECENT_TITLE = "Récentes";

/** Le nom du dossier affiché : celui de l'espace de travail pour la racine. */
function folderName(workspaceName: string, folder: string): string {
  return folder === "" ? workspaceName : nameOf(folder);
}

type WorkspaceScreen = Extract<Screen, { kind: "workspace" }>;

/** Le titre de la liste : la corbeille, Récentes, l'étiquette du filtre ou le dossier affiché. */
function listTitle(screen: WorkspaceScreen, tag: string | null, recent: boolean): string {
  if (screen.trash) return TRASH_TITLE;
  if (recent) return RECENT_TITLE;
  return tag === null ? folderName(screen.workspace.name, screen.folder) : `#${tag}`;
}

/** La liste des notes : la corbeille, les notes trouvées, ou celles du dossier ou du filtre. */
function renderList(
  layout: Layout,
  screen: WorkspaceScreen,
  search: Search | null,
  actions: ScreenActions,
) {
  if (screen.trash) {
    renderTrash(layout.notesList, screen.workspace.name, screen.trash, actions);
  } else if (search) {
    renderSearchResults(
      layout.notesList,
      screen.workspace.name,
      search.results,
      screen.selected,
      actions,
    );
  } else {
    renderNotesList(layout.notesList, screen.notes, screen.selected, actions);
  }
}

/** La liste des dossiers : le dossier en évidence (aucun hors de ses notes), Récentes, les étiquettes. */
function renderNavigation(
  layout: Layout,
  screen: WorkspaceScreen,
  shown: { readonly tag: string | null; readonly recent: boolean },
  actions: ScreenActions,
) {
  renderFoldersList(
    layout.foldersList,
    screen.workspace.name,
    screen.folders,
    screen.trash || screen.tag !== null || screen.recent ? null : screen.folder,
    actions,
    screen.folded,
  );
  renderRecentEntry(layout.recentButton, shown.recent, actions.showRecent);
  renderTagsList(layout.tagsList, screen.tags, shown.tag, actions.selectTag);
  renderTagFilter(layout.tagFilter, shown.tag, actions.clearTag);
}

function renderWorkspace(layout: Layout, screen: WorkspaceScreen, actions: ScreenActions) {
  layout.welcome.hidden = true;
  layout.mainArea.hidden = false;
  const search = screen.search && searchable(screen.search.query) ? screen.search : null;
  // Le filtre et Récentes se voient quand la liste montre leurs notes : ni recherche, ni corbeille.
  const aside = screen.trash !== null || search !== null;
  const shown = { tag: aside ? null : screen.tag, recent: !aside && screen.recent };
  layout.workspaceSwitcher.textContent = screen.workspace.name;
  layout.listHeading.textContent = listTitle(screen, shown.tag, shown.recent);
  renderNavigation(layout, screen, shown, actions);
  // La corbeille n'a pas de tri : ses notes sont rangées par chemin ; les récentes, par ouverture.
  renderNoteOrder(
    layout.noteOrder,
    screen.trash || shown.recent ? null : screen.order,
    actions.sortNotes,
  );
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
      layout.mainArea.hidden = true;
      return;
    case "workspace":
      return renderWorkspace(layout, screen, actions);
    // Stryker disable all: cas impossible, le compilateur vérifie que tous les cas sont traités.
    /* istanbul ignore next -- cas impossible : le compilateur vérifie que tous les cas sont traités */
    default: {
      const unhandled: never = screen;
      return unhandled;
    }
    // Stryker restore all
  }
}
