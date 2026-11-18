// Dossiers : choisir celui qu'on affiche, en créer un, le renommer ou le déplacer.
import type * as Bridge from "../bridge";
import { startFolderCreation } from "../screens/folders-list";
import { notesMoved } from "../state/columns";
import { movedPath } from "../state/folders";
import {
  currentFolder,
  folderFolded,
  folderMoved,
  folderSelected,
  foldersRefreshed,
  noteOrder,
  selectedNote,
} from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { RecentNotes } from "./recent-notes";

export interface FoldersDeps {
  readonly backend: Pick<
    typeof Bridge,
    "listFolders" | "listNotes" | "createFolder" | "renameFolder" | "moveFolder"
  >;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "activePane" | "flushAll" | "showNote" | "update">;
  /** Relit la liste des notes du dossier affiché. */
  refreshList(): Promise<void>;
  /** Les notes récentes, qui suivent les notes d'un dossier renommé ou déplacé. */
  readonly recent: Pick<RecentNotes, "moved">;
  /** La liste des dossiers, où s'écrit le nom d'un nouveau dossier. */
  readonly list: HTMLElement;
  run(action: Promise<unknown>): void;
}

export interface Folders {
  /** Affiche ce dossier ; rechoisir celui qui est affiché ne le recharge pas, sauf pour quitter la corbeille. */
  select(folder: string): Promise<void>;
  /** Crée un dossier et l'affiche. */
  create(parent: string, name: string): Promise<void>;
  rename(path: string, name: string): Promise<void>;
  move(path: string, into: string): Promise<void>;
  /** Fait écrire le nom d'un nouveau dossier, dans le dossier affiché. */
  startCreation(): void;
  /** Plie le dossier, ou le déplie s'il est plié, sans le choisir. */
  fold(path: string): void;
}

async function selectFolder(deps: FoldersDeps, folder: string) {
  const screen = deps.screen.get();
  const trashOpen = screen.kind === "library" && screen.trash !== null;
  if (folder === currentFolder(screen) && !trashOpen) return;
  await deps.columns.activePane().flush();
  await deps.screen.answer(deps.backend.listNotes(folder, noteOrder(screen)), (now, answer) =>
    folderSelected(now, folder, answer),
  );
  await deps.columns.showNote(selectedNote(deps.screen.get()));
}

/** Renomme ou déplace un dossier : ce qui est enregistré d'abord, puis tout suit le nouveau chemin. */
async function changeFolder(deps: FoldersDeps, path: string, change: Promise<string>) {
  await deps.columns.flushAll();
  const to = await change;
  deps.recent.moved((note) => movedPath(note, path, to));
  deps.screen.show(folderMoved(deps.screen.get(), path, to));
  await deps.screen.answer(deps.backend.listFolders(), foldersRefreshed);
  await deps.refreshList();
  await deps.columns.update((now) => notesMoved(now, (note) => movedPath(note, path, to)));
}

export function createFolders(deps: FoldersDeps): Folders {
  const create = async (parent: string, name: string) => {
    const created = await deps.backend.createFolder(parent, name);
    await deps.screen.answer(deps.backend.listFolders(), foldersRefreshed);
    await selectFolder(deps, created);
  };
  return {
    select: (folder) => selectFolder(deps, folder),
    create,
    rename: (path, name) => changeFolder(deps, path, deps.backend.renameFolder(path, name)),
    move: (path, into) => changeFolder(deps, path, deps.backend.moveFolder(path, into)),
    startCreation: () =>
      startFolderCreation(deps.list, currentFolder(deps.screen.get()), (parent, name) =>
        deps.run(create(parent, name)),
      ),
    fold: (path) => deps.screen.show(folderFolded(deps.screen.get(), path)),
  };
}
