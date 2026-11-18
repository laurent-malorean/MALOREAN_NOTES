// Notes récentes : celles que la colonne active a montrées, gardées pour chaque bibliothèque,
// qui suivent les renommages, et Récentes, qui les montre dans la liste comme un dossier.
import type * as Bridge from "../bridge";
import type { NoteListItem } from "../bridge";
import { activeNote, type Columns } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import {
  loadRecent,
  noteVisited,
  recentKept,
  recentMoved,
  saveRecent,
} from "../state/recent-notes";
import { recentShown, type Screen, selectedNote } from "../state/screen";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";

export interface RecentNotesDeps {
  readonly backend: Pick<typeof Bridge, "listRecentNotes">;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "activePane" | "showNote">;
  /** Là où les notes récentes de chaque bibliothèque sont gardées. */
  readonly storage: PreferenceStorage;
}

export interface RecentNotes {
  /** Les chemins des notes récentes de la bibliothèque affichée, la plus récente d'abord. */
  paths(): readonly string[];
  /** Les colonnes ont changé : la note que montre la colonne active passe en tête. */
  visited(columns: Columns): void;
  /** Des notes ont changé de chemin : elles restent, sous le nouveau. */
  moved(rename: (path: string) => string): void;
  /** Les notes récentes telles qu'elles sont maintenant ; celles parties sont oubliées. */
  list(): Promise<NoteListItem[]>;
  /** Récentes : la liste montre les notes récentes, ce qui est tapé étant enregistré d'abord ; la colonne active montre la première. */
  show(): Promise<void>;
}

const libraryOf = (screen: Screen) => (screen.kind === "library" ? screen.library.path : null);

export function createRecentNotes(deps: RecentNotesDeps): RecentNotes {
  const shown = () => libraryOf(deps.screen.get());
  /** Celles de la bibliothèque affichée, telles que gardées ; aucune sur l'accueil. */
  const paths = (): readonly string[] => {
    const screen = deps.screen.get();
    return screen.kind === "library" ? loadRecent(deps.storage, screen.library.path) : [];
  };
  const change = (next: (now: readonly string[]) => readonly string[]) => {
    const library = shown();
    if (library !== null) saveRecent(deps.storage, library, next(paths()));
  };
  const list = async () => {
    const library = shown();
    const asked = paths();
    const notes = await deps.backend.listRecentNotes(asked);
    const found = new Set(notes.map((note) => note.path));
    // Une réponse arrivée après un changement de bibliothèque ne dit rien des notes de la nouvelle.
    if (shown() === library) {
      change((now) => recentKept(now, (path) => found.has(path) || !asked.includes(path)));
    }
    return notes;
  };
  return {
    paths,
    visited: (columns) => change((now) => noteVisited(now, activeNote(columns))),
    moved: (rename) => change((now) => recentMoved(now, rename)),
    list,
    show: async () => {
      await deps.columns.activePane().flush();
      await deps.screen.answer(list(), recentShown);
      await deps.columns.showNote(selectedNote(deps.screen.get()));
    },
  };
}
