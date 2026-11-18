// La bibliothèque ouverte : son choix, ses dossiers et la liste de ses notes, les notes qu'on y crée,
// déplace ou épingle, et les liens qui mènent d'une note à l'autre.
import type * as Bridge from "../bridge";
import type { LibraryInfo, NoteContent } from "../bridge";
import { notesMoved, noteShown, notesRemoved } from "../state/columns";
import {
  currentFolder,
  activeTag,
  folderRevealed,
  foldersRefreshed,
  libraryOpened,
  notesRefreshed,
  selectedNote,
  tagsRefreshed,
} from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { FoldMemory } from "./fold-memory";
import type { LayoutMemory } from "./layout-memory";

export interface LibraryDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "chooseLibrary"
    | "listFolders"
    | "listNotes"
    | "listTaggedNotes"
    | "listTags"
    | "createNote"
    | "resolveLink"
    | "moveNote"
  >;
  readonly screen: CurrentScreen;
  readonly columns: OpenColumns;
  /** Les colonnes gardées pour chaque bibliothèque. */
  readonly layout: Pick<LayoutMemory, "restore">;
  /** Les dossiers pliés gardés pour chaque bibliothèque. */
  readonly folds: Pick<FoldMemory, "load">;
  /** Montre un message quelques secondes. */
  show(message: string): void;
  /** Relance la recherche en cours sur les notes telles qu'elles sont maintenant. */
  search(query: string): Promise<void>;
}

export interface Library {
  /** Le dossier de la bibliothèque ouverte. */
  path(): string;
  /** Ouvre cette bibliothèque. */
  open(library: LibraryInfo): Promise<void>;
  /** Fait choisir une autre bibliothèque, ce qui est tapé étant enregistré dans celle d'où l'on vient. */
  choose(): Promise<void>;
  /** Relit les dossiers et la liste des étiquettes. */
  refreshFolders(): Promise<void>;
  /** Relit la liste des étiquettes : une note en a gagné, perdu, ou a disparu. */
  refreshTags(): Promise<void>;
  /**
   * Relit la liste des notes du dossier affiché (ou du filtre par étiquette), et la recherche en
   * cours.
   */
  refreshList(): Promise<void>;
  /** Crée une note dans le dossier affiché et l'ouvre, prête à écrire. */
  createNote(): Promise<void>;
  /** Ouvre la note qu'un lien `[[titre]]` désigne, ce qui est tapé étant enregistré d'abord. */
  followLink(title: string): Promise<void>;
  /**
   * Déplace une note dans un autre dossier, dont ceux qui le contiennent se déplient ; la liste
   * reste sur le dossier affiché.
   * Les colonnes qui la montrent la gardent, sous son nouveau chemin, une fois ce qui est tapé enregistré.
   */
  moveNote(path: string, into: string): Promise<void>;
  /**
   * Épingle ou désépingle une note. Ce qui est tapé est enregistré d'abord ; les colonnes qui la
   * montrent affichent son nouvel en-tête.
   */
  changePin(path: string, change: (path: string) => Promise<NoteContent>): Promise<void>;
}

async function refreshList(deps: LibraryDeps) {
  const tag = activeTag(deps.screen.get());
  await deps.screen.answer(
    tag === null
      ? deps.backend.listNotes(currentFolder(deps.screen.get()))
      : deps.backend.listTaggedNotes(tag),
    notesRefreshed,
  );
  const screen = deps.screen.get();
  // Stryker disable next-line ConditionalExpression: l'accueil n'a pas de recherche, la seconde condition l'écarte aussi ; TypeScript exige la première.
  if (screen.kind === "library" && screen.search) await deps.search(screen.search.query);
}

async function openLibrary(deps: LibraryDeps, library: LibraryInfo) {
  const folders = await deps.backend.listFolders();
  const notes = await deps.backend.listNotes("");
  const tags = await deps.backend.listTags();
  const opened = libraryOpened(library, folders, notes, deps.folds.load(library.path));
  deps.screen.show(tagsRefreshed(opened, tags));
  const restored = await deps.layout.restore(library.path);
  // Sans colonnes gardées : celles d'avant montraient peut-être des notes d'une autre bibliothèque.
  await deps.columns.change(
    restored ??
      noteShown(
        notesRemoved(deps.columns.current(), () => true),
        selectedNote(deps.screen.get()),
      ),
  );
}

async function createNote(deps: LibraryDeps) {
  const created = await deps.backend.createNote(currentFolder(deps.screen.get()));
  await refreshList(deps);
  await deps.columns.openNote(created.path);
  deps.columns.activePane().editor.focus();
}

async function followLink(deps: LibraryDeps, title: string) {
  await deps.columns.activePane().flush();
  const path = await deps.backend.resolveLink(title);
  if (path === null) return deps.show(`Aucune note ne porte le titre « ${title} ».`);
  await deps.columns.openNote(path);
}

async function moveNote(deps: LibraryDeps, path: string, into: string) {
  const source = await deps.columns.flushedPath(path);
  const moved = await deps.backend.moveNote(source, into);
  deps.screen.show(folderRevealed(deps.screen.get(), into));
  await refreshList(deps);
  await deps.columns.update((now) =>
    notesMoved(now, (note) => (note === source ? moved.path : note)),
  );
}

async function changePin(
  deps: LibraryDeps,
  path: string,
  change: (path: string) => Promise<NoteContent>,
) {
  const source = await deps.columns.flushedPath(path);
  const note = await change(source);
  deps.columns.panes().forEach((pane) => pane.note() === source && pane.editor.show(note.content));
  await refreshList(deps);
}

export function createLibrary(deps: LibraryDeps): Library {
  let libraryPath = "";
  const refreshTags = () => deps.screen.answer(deps.backend.listTags(), tagsRefreshed);
  const open = (library: LibraryInfo) => {
    libraryPath = library.path;
    return openLibrary(deps, library);
  };
  return {
    path: () => libraryPath,
    open,
    choose: async () => {
      await deps.columns.flushAll();
      const library = await deps.backend.chooseLibrary();
      if (library) await open(library);
    },
    refreshFolders: async () => {
      await deps.screen.answer(deps.backend.listFolders(), foldersRefreshed);
      await refreshTags();
    },
    refreshTags,
    refreshList: () => refreshList(deps),
    createNote: () => createNote(deps),
    followLink: (title) => followLink(deps, title),
    moveNote: (path, into) => moveNote(deps, path, into),
    changePin: (path, change) => changePin(deps, path, change),
  };
}
