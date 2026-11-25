// Doublures pour les tests des modules de l'assemblage (src/app/) : colonnes, éditeurs et écran.
import { vi } from "vitest";
import type { NoteListItem } from "../src/bridge";
import type { OpenColumns } from "../src/app/columns";
import { createCurrentScreen } from "../src/app/current-screen";
import type { Pane } from "../src/screens/note-pane";
import {
  type Columns,
  columnsStarted,
  noteFollowed,
  noteOpened,
  noteShown,
} from "../src/state/columns";
import { workspaceOpened, type Screen } from "../src/state/screen";

/** Un éditeur de colonne simulé : chaque demande est notée dans `log`. */
export function fakePane(note: string | null = null, log: string[] = []) {
  let shown = note;
  const editor = {
    setOutline: vi.fn(),
    setTypewriter: vi.fn(),
    setFocusMode: vi.fn(),
    setCharactersPerPage: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    openFind: vi.fn(),
    format: vi.fn(),
    insertToday: vi.fn(),
    openLinkAtCursor: vi.fn(),
    position: vi.fn(() => ({ anchor: 0, head: 0, top: 0, offset: 0 })),
    restore: vi.fn(),
  };
  const pane = {
    editor,
    note: () => shown,
    /** La note montrée change de chemin, comme après un enregistrement qui la renomme. */
    renamed: (path: string) => void (shown = path),
    load: vi.fn(async (path: string | null) => void (shown = path)),
    flush: vi.fn(async () => void log.push(`enregistrer ${shown}`)),
    forget: vi.fn(() => void log.push(`oublier ${shown}`)),
    showBacklinks: vi.fn(async () => void log.push(`liens ${shown}`)),
    showRelated: vi.fn(async () => void log.push(`proches ${shown}`)),
    followDisk: vi.fn(async () => void log.push(`relire ${shown}`)),
    followCrm: vi.fn(
      async (changed: readonly string[]) => void log.push(`fiches ${shown} ${changed.join(",")}`),
    ),
    destroy: vi.fn(),
  };
  return pane as typeof pane & Pane;
}

/** Des colonnes simulées : leur état suit les demandes, notées dans `log`. */
export function fakeColumns(start: Columns = columnsStarted) {
  const log: string[] = [];
  const panes = new Map<number, Pane>();
  let columns = start;
  const set = (next: Columns) => {
    columns = next;
    log.push("colonnes");
  };
  const open: OpenColumns = {
    current: () => columns,
    change: async (next) => set(next),
    update: async (next) => set(next(columns)),
    changeFlushed: async (next) => {
      log.push("tout enregistrer");
      set(next());
    },
    split: async () => void log.push("diviser"),
    flushAll: async () => void log.push("tout enregistrer"),
    flushedPath: async (path) => {
      log.push(`enregistrer ${path}`);
      return path;
    },
    activePane: () => panes.get(columns.active) as Pane,
    panes: () => panes,
    forget: (gone) => panes.forEach((pane) => gone(pane.note() ?? "") && pane.forget()),
    showNote: async (path) => {
      log.push(`montrer ${path}`);
      columns = noteShown(columns, path);
    },
    openNote: async (path) => {
      log.push(`ouvrir ${path}`);
      columns = noteOpened(columns, path);
    },
    followNote: async (path) => {
      log.push(`suivre ${path}`);
      columns = noteFollowed(columns, path, null);
    },
    walk: async (columnId, step) => void log.push(`parcours ${columnId} ${step}`),
  };
  return { open, log, panes, columns: () => columns };
}

/** Une note de la liste. */
export const listed = (path: string, title = path): NoteListItem => ({
  path,
  title,
  modified: 0,
  pinned: false,
  tags: [],
});

/** Un espace de travail ouvert, puis changée par `change`. */
export function workspaceScreen(
  notes: readonly NoteListItem[] = [],
  change: (screen: Extract<Screen, { kind: "workspace" }>) => Screen = (screen) => screen,
): Screen {
  const opened = workspaceOpened({ name: "Notes", path: "/lib" }, [], notes);
  return change(opened as Extract<Screen, { kind: "workspace" }>);
}

/** L'écran affiché, qui note chaque état dessiné. */
export function recordedScreen(start: Screen = workspaceScreen()) {
  const shown: Screen[] = [];
  const screen = createCurrentScreen((next) => shown.push(next));
  screen.show(start);
  shown.length = 0;
  return { screen, shown };
}

/** Laisse passer les promesses déjà résolues. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
