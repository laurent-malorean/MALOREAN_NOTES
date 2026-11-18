// Corbeille : y placer une note ou un dossier après confirmation, la montrer, restaurer, vider.
import type * as Bridge from "../bridge";
import { activeNote, noteShown, notesRemoved } from "../state/columns";
import { folderOf, nameOf } from "../state/folders";
import {
  currentFolder,
  folderSelected,
  foldersRefreshed,
  noteOrder,
  type Screen,
  selectedNote,
  trashShown,
} from "../state/screen";
import { initialSelection, nextSelection } from "../state/selection";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";

export interface TrashDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "trashNote"
    | "trashFolder"
    | "listTrash"
    | "listFolders"
    | "listNotes"
    | "restoreNote"
    | "restoreFolder"
    | "emptyTrash"
  >;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "current" | "change" | "flushAll" | "flushedPath" | "forget">;
  /** Demande s'il faut placer l'élément ainsi nommé dans la corbeille. */
  ask(name: string): Promise<boolean>;
  /** Relit la liste des notes du dossier affiché (ou du filtre par étiquette). */
  refreshList(): Promise<void>;
  /** Relit la liste des étiquettes : une note partie ou revenue change leurs nombres. */
  refreshTags(): Promise<void>;
}

export interface Trash {
  /** Place une note dans la corbeille, si on le confirme. */
  trashNote(path: string): Promise<void>;
  /** Place un dossier dans la corbeille, avec tout ce qu'il contient, si on le confirme. */
  trashFolder(path: string): Promise<void>;
  show(): Promise<void>;
  restoreNote(path: string): Promise<void>;
  restoreFolder(path: string): Promise<void>;
  empty(): Promise<void>;
}

const noteTitle = (screen: Screen, path: string) =>
  (screen.kind === "library" && screen.notes.find((note) => note.path === path)?.title) || path;

/**
 * Place une note dans la corbeille, une fois ce qui est tapé enregistré ; si la colonne active la
 * montrait, la suivante de la liste s'y ouvre (ou aucune).
 */
async function trashNote(deps: TrashDeps, path: string) {
  const source = await deps.columns.flushedPath(path);
  const gone = (note: string) => note === source;
  const screen = deps.screen.get();
  const next = screen.kind === "library" ? nextSelection(screen.notes, source) : null;
  await deps.backend.trashNote(source);
  deps.columns.forget(gone);
  await deps.refreshList();
  await deps.refreshTags();
  const columns = deps.columns.current();
  const replaced = activeNote(columns) === source ? noteShown(columns, next) : columns;
  await deps.columns.change(notesRemoved(replaced, gone));
}

/**
 * Place un dossier dans la corbeille, avec tout ce qu'il contient. Si l'on y était, la liste
 * revient à la bibliothèque ; si la note de la colonne active y était, une autre s'y ouvre.
 */
async function trashFolder(deps: TrashDeps, path: string) {
  await deps.columns.flushAll();
  const inside = (p: string) => p === path || p.startsWith(`${path}/`);
  const gone = (note: string) => inside(folderOf(note));
  const listInside = inside(currentFolder(deps.screen.get()));
  const active = activeNote(deps.columns.current());
  const activeGone = active !== null && gone(active);
  await deps.backend.trashFolder(path);
  deps.columns.forget(gone);
  await deps.screen.answer(deps.backend.listFolders(), foldersRefreshed);
  await deps.refreshTags();
  let next = deps.columns.current();
  if (listInside) {
    await deps.screen.answer(
      deps.backend.listNotes("", noteOrder(deps.screen.get())),
      (now, answer) => folderSelected(now, "", answer),
    );
    next = noteShown(next, selectedNote(deps.screen.get()));
  } else {
    await deps.refreshList();
    const screen = deps.screen.get();
    if (activeGone)
      next = noteShown(next, screen.kind === "library" ? initialSelection(screen.notes) : null);
  }
  await deps.columns.change(notesRemoved(next, gone));
}

export function createTrash(deps: TrashDeps): Trash {
  const show = () => deps.screen.answer(deps.backend.listTrash(), trashShown);
  /** Restaure ou vide : la corbeille, les dossiers, les étiquettes et la liste sont relus. */
  const change = async (change: Promise<unknown>) => {
    await change;
    await deps.screen.answer(deps.backend.listFolders(), foldersRefreshed);
    await deps.refreshTags();
    await deps.refreshList();
    await show();
  };
  /** Placer une note ou un dossier dans la corbeille attend d'abord sa confirmation. */
  const confirm = async (name: string, trash: () => Promise<void>) => {
    if (await deps.ask(name)) await trash();
  };
  return {
    trashNote: (path) => confirm(noteTitle(deps.screen.get(), path), () => trashNote(deps, path)),
    trashFolder: (path) => confirm(nameOf(path), () => trashFolder(deps, path)),
    show,
    restoreNote: (path) => change(deps.backend.restoreNote(path)),
    restoreFolder: (path) => change(deps.backend.restoreFolder(path)),
    empty: () => change(deps.backend.emptyTrash()),
  };
}
