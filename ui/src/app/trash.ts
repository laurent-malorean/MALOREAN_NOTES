// Corbeille : y placer une note ou un dossier après confirmation, la montrer, restaurer, vider.
import type * as Bridge from "../bridge";
import type { TrashedEvent } from "../screens/agenda-12-event-band";
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
    | "deleteAgenda12Event"
    | "crmFichesInTrash"
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
  /** Demande s'il faut placer l'élément ainsi nommé dans la corbeille, avec les `fiches` d'un CRM qui partent avec lui. */
  ask(name: string, fiches: number): Promise<boolean>;
  /** Relit la liste des notes du dossier affiché (ou du filtre par étiquette). */
  refreshList(): Promise<void>;
  /** Relit la liste des étiquettes : une note partie ou revenue change leurs nombres. */
  refreshTags(): Promise<void>;
}

export interface Trash {
  /** Place un événement d'un agenda 12 dans la corbeille, si on le confirme, et ouvre son agenda 12 (fiche 0104). */
  trashEvent(event: TrashedEvent): Promise<void>;
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
  (screen.kind === "workspace" && screen.notes.find((note) => note.path === path)?.title) || path;

/**
 * Place une note dans la corbeille, une fois ce qui est tapé enregistré ; si la colonne active la
 * montrait, la suivante de la liste s'y ouvre (ou aucune).
 */
async function trashNote(deps: TrashDeps, path: string, fiches: number, event?: TrashedEvent) {
  const source = await deps.columns.flushedPath(path);
  // Un CRM emporte ses fiches, rangées dans le dossier qui porte son nom : leurs onglets se ferment aussi.
  const fichesFolder = `${source.replace(/\.md$/, "")}/`;
  const gone = (note: string) => note === source || (fiches > 0 && note.startsWith(fichesFolder));
  const screen = deps.screen.get();
  // Un événement n'est pas dans la liste : c'est son agenda 12 qui s'ouvre à sa place.
  const listed = screen.kind === "workspace" ? nextSelection(screen.notes, source) : null;
  const next = event === undefined ? listed : event.agenda;
  await (event === undefined
    ? deps.backend.trashNote(source)
    : deps.backend.deleteAgenda12Event(source));
  deps.columns.forget(gone);
  await deps.refreshList();
  await deps.refreshTags();
  const columns = deps.columns.current();
  const replaced = activeNote(columns) === source ? noteShown(columns, next) : columns;
  await deps.columns.change(notesRemoved(replaced, gone));
}

/**
 * Place un dossier dans la corbeille, avec tout ce qu'il contient. Si l'on y était, la liste
 * revient à l'espace de travail ; si la note de la colonne active y était, une autre s'y ouvre.
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
      next = noteShown(next, screen.kind === "workspace" ? initialSelection(screen.notes) : null);
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
  const confirm = async (name: string, fiches: number, trash: () => Promise<void>) => {
    if (await deps.ask(name, fiches)) await trash();
  };
  return {
    trashEvent: (event) => confirm(event.title, 0, () => trashNote(deps, event.path, 0, event)),
    trashNote: async (path) => {
      const fiches = await deps.backend.crmFichesInTrash(path);
      await confirm(noteTitle(deps.screen.get(), path), fiches, () =>
        trashNote(deps, path, fiches),
      );
    },
    trashFolder: (path) => confirm(nameOf(path), 0, () => trashFolder(deps, path)),
    show,
    restoreNote: (path) => change(deps.backend.restoreNote(path)),
    restoreFolder: (path) => change(deps.backend.restoreFolder(path)),
    empty: () => change(deps.backend.emptyTrash()),
  };
}
