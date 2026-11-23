// Demandes de l'écran : ce que la liste des dossiers, la liste des notes, les étiquettes,
// Récentes et la corbeille demandent, confié au module de chaque domaine.
import type * as Bridge from "../bridge";
import type { ScreenActions } from "../screens/screen-view";
import { noteClosed, notePlaced } from "../state/columns";
import { searchedQuery, searchTyped } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Exporting } from "./export";
import type { Folders } from "./folders";
import type { NewContents } from "./new-contents";
import type { NoteHistory } from "./history";
import type { AppSettings } from "./settings";
import type { Workspace } from "./workspace";
import type { RecentNotes } from "./recent-notes";
import type { Tags } from "./tags";
import type { Trash } from "./trash";

export interface ScreenActionsDeps {
  readonly backend: Pick<typeof Bridge, "pinNote" | "unpinNote">;
  readonly screen: Pick<CurrentScreen, "get" | "show">;
  readonly columns: Pick<OpenColumns, "openNote" | "update" | "activePane">;
  readonly folders: Pick<Folders, "select" | "create" | "rename" | "move" | "fold">;
  readonly workspace: Pick<Workspace, "moveNote" | "changePin" | "sortBy" | "createNote">;
  /** Ce qu'on crée dans un dossier, par son menu. */
  readonly notebooks: Pick<NewContents, "create" | "createMindMap">;
  readonly trash: Pick<
    Trash,
    "trashNote" | "trashFolder" | "restoreNote" | "restoreFolder" | "empty"
  >;
  readonly tags: Tags;
  readonly recent: Pick<RecentNotes, "show">;
  /** L'export et l'impression d'une note, demandés par son menu dans la liste. */
  readonly exporting: Exporting;
  /** L'historique d'une note, demandé par son menu dans la liste. */
  readonly history: NoteHistory;
  /** Les réglages, que la fenêtre de recherche ouvre sur l'onglet « Index » quand le sens manque. */
  readonly settings: Pick<AppSettings, "openTab">;
  /** Lance l'action ; son échec est montré. */
  run(action: Promise<unknown>): void;
}

export function screenActions(deps: ScreenActionsDeps): ScreenActions {
  const {
    backend,
    screen,
    columns,
    folders,
    workspace,
    trash,
    tags,
    recent,
    exporting,
    history,
    notebooks,
    settings,
    run,
  } = deps;
  /** Ferme la fenêtre de recherche, et vide le champ ; sans fenêtre ouverte, ne touche à rien. */
  const closeSearch = () => {
    if (searchedQuery(screen.get()) !== null) screen.show(searchTyped(screen.get(), ""));
  };
  /** Ouvre la note ; trouvée par une recherche, elle s'ouvre sur le terme cherché, et la fenêtre se ferme. */
  const openAtSearch = async (path: string, node: string | null = null) => {
    const query = searchedQuery(screen.get());
    await columns.openNote(path);
    closeSearch();
    if (node !== null) return columns.activePane().revealNode(node);
    if (query !== null) columns.activePane().editor.reveal(query);
  };
  return {
    open: (path, node) => run(openAtSearch(path, node)),
    select: (folder) => run(folders.select(folder)),
    create: (parent, name) => run(folders.create(parent, name)),
    rename: (path, name) => run(folders.rename(path, name)),
    move: (path, into) => run(folders.move(path, into)),
    fold: (path) => folders.fold(path),
    newNote: (folder) => run(workspace.createNote(folder)),
    newMindMap: (folder) => run(notebooks.createMindMap(folder)),
    newNotebook: (folder) => run(notebooks.create(folder)),
    moveNote: (path, into) => run(workspace.moveNote(path, into)),
    pin: (path) => run(workspace.changePin(path, backend.pinNote)),
    unpin: (path) => run(workspace.changePin(path, backend.unpinNote)),
    trash: (path) => run(trash.trashNote(path)),
    place: (path, placement) =>
      run(columns.update((now) => notePlaced(now, path, placement)).then(closeSearch)),
    closeSearch,
    openIndexSettings: () => settings.openTab("Index"),
    closeNote: (path) => run(columns.update((now) => noteClosed(now, path))),
    exportNote: (path) => exporting.exportNote(path),
    printNote: (path) => exporting.printNote(path),
    copyNote: (path) => exporting.copyNote(path),
    copyMarkdown: (path) => exporting.copyMarkdown(path),
    showHistory: (path) => history.show(path),
    trashFolder: (path) => run(trash.trashFolder(path)),
    restoreNote: (path) => run(trash.restoreNote(path)),
    restoreFolder: (path) => run(trash.restoreFolder(path)),
    empty: () => run(trash.empty()),
    selectTag: (tag) => run(tags.select(tag)),
    clearTag: () => void tags.clear(),
    sortNotes: (order) => run(workspace.sortBy(order)),
    showRecent: () => run(recent.show()),
  };
}
