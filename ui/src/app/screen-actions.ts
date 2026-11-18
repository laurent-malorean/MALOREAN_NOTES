// Demandes de l'écran : ce que la colonne des dossiers, la liste des notes, les étiquettes,
// Récentes et la corbeille demandent, confié au module de chaque domaine.
import type * as Bridge from "../bridge";
import type { ScreenActions } from "../screens/screen-view";
import { noteClosed, notePlaced } from "../state/columns";
import type { OpenColumns } from "./columns";
import type { Exporting } from "./export";
import type { Folders } from "./folders";
import type { Workspace } from "./workspace";
import type { RecentNotes } from "./recent-notes";
import type { Tags } from "./tags";
import type { Trash } from "./trash";

export interface ScreenActionsDeps {
  readonly backend: Pick<typeof Bridge, "pinNote" | "unpinNote">;
  readonly columns: Pick<OpenColumns, "openNote" | "update">;
  readonly folders: Pick<Folders, "select" | "create" | "rename" | "move" | "fold">;
  readonly workspace: Pick<Workspace, "moveNote" | "changePin" | "sortBy">;
  readonly trash: Pick<
    Trash,
    "trashNote" | "trashFolder" | "restoreNote" | "restoreFolder" | "empty"
  >;
  readonly tags: Tags;
  readonly recent: Pick<RecentNotes, "show">;
  /** L'export d'une note, demandé par son menu dans la liste. */
  readonly exporting: Exporting;
  /** Lance l'action ; son échec est montré. */
  run(action: Promise<unknown>): void;
}

export function screenActions(deps: ScreenActionsDeps): ScreenActions {
  const { backend, columns, folders, workspace, trash, tags, recent, exporting, run } = deps;
  return {
    open: (path) => run(columns.openNote(path)),
    select: (folder) => run(folders.select(folder)),
    create: (parent, name) => run(folders.create(parent, name)),
    rename: (path, name) => run(folders.rename(path, name)),
    move: (path, into) => run(folders.move(path, into)),
    fold: (path) => folders.fold(path),
    moveNote: (path, into) => run(workspace.moveNote(path, into)),
    pin: (path) => run(workspace.changePin(path, backend.pinNote)),
    unpin: (path) => run(workspace.changePin(path, backend.unpinNote)),
    trash: (path) => run(trash.trashNote(path)),
    place: (path, placement) => run(columns.update((now) => notePlaced(now, path, placement))),
    closeNote: (path) => run(columns.update((now) => noteClosed(now, path))),
    exportNote: (path) => exporting.exportNote(path),
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
