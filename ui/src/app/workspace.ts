// L'espace de travail ouvert : ses dossiers et la liste de ses notes (et son tri), les notes
// qu'on y crée, déplace ou épingle, les liens qui mènent d'une note à l'autre, et son index.
import type * as Bridge from "../bridge";
import type { WorkspaceInfo, NoteContent } from "../bridge";
import { notesMoved, noteShown, notesRemoved } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import { loadNoteOrder, type NoteOrder, saveNoteOrder } from "../state/note-order";
import {
  currentFolder,
  activeTag,
  folderRevealed,
  foldersRefreshed,
  workspaceOpened,
  noteOrder,
  notesRefreshed,
  orderChosen,
  recentOn,
  selectedNote,
  tagsRefreshed,
} from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { FoldMemory } from "./fold-memory";
import type { LayoutMemory } from "./layout-memory";
import type { RecentNotes } from "./recent-notes";

export interface WorkspaceDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "listFolders"
    | "listNotes"
    | "listTaggedNotes"
    | "listTags"
    | "createNote"
    | "resolveLink"
    | "moveNote"
    | "rebuildIndex"
  >;
  readonly screen: CurrentScreen;
  readonly columns: OpenColumns;
  /** Les colonnes gardées pour chaque espace de travail. */
  readonly layout: Pick<LayoutMemory, "restore">;
  /** Les dossiers pliés gardés pour chaque espace de travail. */
  readonly folds: Pick<FoldMemory, "load">;
  /** Là où le tri de la liste de chaque espace de travail est gardé. */
  readonly storage: PreferenceStorage;
  /** Montre un message quelques secondes. */
  show(message: string): void;
  /** Relance la recherche en cours sur les notes telles qu'elles sont maintenant. */
  search(query: string): Promise<void>;
  /** Les notes récentes, que Récentes montre et qui suivent une note déplacée. */
  readonly recent: Pick<RecentNotes, "list" | "moved">;
}

export interface Workspace {
  /** Le dossier de l'espace de travail ouvert. */
  path(): string;
  /** Ouvre cet espace de travail. */
  open(workspace: WorkspaceInfo): Promise<void>;
  /** Relit les dossiers et la liste des étiquettes. */
  refreshFolders(): Promise<void>;
  /** Relit la liste des étiquettes : une note en a gagné, perdu, ou a disparu. */
  refreshTags(): Promise<void>;
  /**
   * Relit la liste des notes du dossier affiché (ou du filtre par étiquette, ou des notes
   * récentes), et la recherche en cours.
   */
  refreshList(): Promise<void>;
  /** Trie la liste (et la recherche en cours) autrement ; ce tri est gardé pour l'espace de travail. */
  sortBy(order: NoteOrder): Promise<void>;
  /** Crée une note dans le dossier affiché et l'ouvre, prête à écrire. */
  createNote(): Promise<void>;
  /**
   * Ouvre la note qu'un lien `[[titre]]` désigne, ce qui est tapé étant enregistré d'abord : dans
   * l'onglet actif, qui garde la note quittée dans son parcours, ou dans un nouvel onglet.
   */
  followLink(title: string, inNewTab: boolean): Promise<void>;
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
  /** Reconstruit l'index à partir des fichiers, puis relit les dossiers, les étiquettes et la liste. */
  rebuildIndex(): Promise<void>;
}

/** Les notes que la liste montre : celles du dossier, du filtre par étiquette, ou les récentes. */
function listedNotes(deps: WorkspaceDeps) {
  const shown = deps.screen.get();
  const tag = activeTag(shown);
  const order = noteOrder(shown);
  if (recentOn(shown)) return deps.recent.list();
  return tag === null
    ? deps.backend.listNotes(currentFolder(shown), order)
    : deps.backend.listTaggedNotes(tag, order);
}

async function refreshList(deps: WorkspaceDeps) {
  await deps.screen.answer(listedNotes(deps), notesRefreshed);
  const screen = deps.screen.get();
  // Stryker disable next-line ConditionalExpression: l'accueil n'a pas de recherche, la seconde condition l'écarte aussi ; TypeScript exige la première.
  if (screen.kind === "workspace" && screen.search) await deps.search(screen.search.query);
}

async function openWorkspace(deps: WorkspaceDeps, workspace: WorkspaceInfo) {
  const order = loadNoteOrder(deps.storage, workspace.path);
  const folders = await deps.backend.listFolders();
  const notes = await deps.backend.listNotes("", order);
  const tags = await deps.backend.listTags();
  const folded = deps.folds.load(workspace.path);
  const opened = workspaceOpened(workspace, folders, notes, folded, order);
  deps.screen.show(tagsRefreshed(opened, tags));
  const restored = await deps.layout.restore(workspace.path);
  // Sans colonnes gardées : celles d'avant montraient peut-être des notes d'un autre espace de travail.
  await deps.columns.change(
    restored ??
      noteShown(
        notesRemoved(deps.columns.current(), () => true),
        selectedNote(deps.screen.get()),
      ),
  );
}

async function sortBy(deps: WorkspaceDeps, workspace: string, order: NoteOrder) {
  deps.screen.show(orderChosen(deps.screen.get(), order));
  saveNoteOrder(deps.storage, workspace, order);
  await refreshList(deps);
}

async function createNote(deps: WorkspaceDeps) {
  const created = await deps.backend.createNote(currentFolder(deps.screen.get()));
  await refreshList(deps);
  await deps.columns.openNote(created.path);
  deps.columns.activePane().editor.focus();
}

async function followLink(deps: WorkspaceDeps, title: string, inNewTab: boolean) {
  await deps.columns.activePane().flush();
  const path = await deps.backend.resolveLink(title);
  if (path === null) return deps.show(`Aucune note ne porte le titre « ${title} ».`);
  await (inNewTab ? deps.columns.openNote(path) : deps.columns.followNote(path));
}

async function moveNote(deps: WorkspaceDeps, path: string, into: string) {
  const source = await deps.columns.flushedPath(path);
  const moved = await deps.backend.moveNote(source, into);
  deps.recent.moved((note) => (note === source ? moved.path : note));
  deps.screen.show(folderRevealed(deps.screen.get(), into));
  await refreshList(deps);
  await deps.columns.update((now) =>
    notesMoved(now, (note) => (note === source ? moved.path : note)),
  );
}

async function changePin(
  deps: WorkspaceDeps,
  path: string,
  change: (path: string) => Promise<NoteContent>,
) {
  const source = await deps.columns.flushedPath(path);
  const note = await change(source);
  deps.columns.panes().forEach((pane) => pane.note() === source && pane.editor.show(note.content));
  await refreshList(deps);
}

export function createWorkspace(deps: WorkspaceDeps): Workspace {
  let workspacePath = "";
  const refreshTags = () => deps.screen.answer(deps.backend.listTags(), tagsRefreshed);
  const open = (workspace: WorkspaceInfo) => {
    workspacePath = workspace.path;
    return openWorkspace(deps, workspace);
  };
  const refreshFolders = async () => {
    await deps.screen.answer(deps.backend.listFolders(), foldersRefreshed);
    await refreshTags();
  };
  return {
    path: () => workspacePath,
    open,
    refreshFolders,
    refreshTags,
    refreshList: () => refreshList(deps),
    sortBy: (order) => sortBy(deps, workspacePath, order),
    createNote: () => createNote(deps),
    followLink: (title, inNewTab) => followLink(deps, title, inNewTab),
    moveNote: (path, into) => moveNote(deps, path, into),
    changePin: (path, change) => changePin(deps, path, change),
    rebuildIndex: async () => {
      await deps.backend.rebuildIndex();
      await refreshFolders();
      await refreshList(deps);
      deps.show("Index reconstruit");
    },
  };
}
