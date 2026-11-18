// Colonnes et onglets : leur état, l'éditeur de chaque colonne, et ce qui suit chaque changement.
import { type ColumnParts, type ColumnsHandlers, createColumnsView } from "../screens/columns-view";
import type { Pane } from "../screens/note-pane";
import {
  activeNote,
  columnActivated,
  type Columns,
  columnSplit,
  columnsResized,
  columnsStarted,
  noteOpened,
  noteShown,
  shownNote,
  tabActivated,
  tabClosed,
  tabDropped,
  tabPlaced,
} from "../state/columns";
import { noteSelected, selectedNote } from "../state/screen";
import type { CurrentScreen } from "./current-screen";

export interface ColumnsDeps {
  /** La zone des colonnes d'édition. */
  readonly container: HTMLElement;
  /** La place du plan, que seul l'éditeur de la colonne active dessine. */
  readonly outline: HTMLElement;
  readonly screen: CurrentScreen;
  /** L'éditeur d'une colonne qui vient d'apparaître. */
  newPane(parts: ColumnParts): Pane;
  /** Les colonnes ont changé : la colonne active est peut-être une autre ; voici leur état. */
  changed(columns: Columns): void;
  /** Ouvrir la fenêtre d'impression sur une note (menu d'un onglet). */
  printNote(path: string): void;
  run(action: Promise<unknown>): void;
}

export interface OpenColumns {
  /** L'état des colonnes tel qu'il est maintenant. */
  current(): Columns;
  /** Les colonnes passent à cet état : l'écran suit, et chaque colonne montre sa note. */
  change(next: Columns): Promise<void>;
  /** Passe à l'état que `next` tire de l'état présent. */
  update(next: (now: Columns) => Columns): Promise<void>;
  /** Les colonnes changent une fois ce qui est tapé enregistré : une note qui change de colonne s'y lit à jour. */
  changeFlushed(next: () => Columns): Promise<void>;
  /** Divise la colonne active, ce qui est tapé étant enregistré. */
  split(): Promise<void>;
  /** Enregistre tout de suite ce qui est tapé, dans toutes les colonnes. */
  flushAll(): Promise<void>;
  /** Enregistre ce qui est tapé ; rend le chemin de la note, que l'enregistrement a pu renommer. */
  flushedPath(path: string): Promise<string>;
  activePane(): Pane;
  /** L'éditeur de chaque colonne, par identifiant de colonne. */
  panes(): ReadonlyMap<number, Pane>;
  /** Les colonnes qui montraient des notes parties à la corbeille n'enregistrent plus rien. */
  forget(gone: (path: string) => boolean): void;
  /** L'onglet actif de la colonne active montre cette note à la place de la sienne. */
  showNote(path: string | null): Promise<void>;
  /** Ouvre une note dans un nouvel onglet de la colonne active, ou retrouve le sien. */
  openNote(path: string): Promise<void>;
}

interface ColumnsState {
  columns: Columns;
  /** L'éditeur qui dessine le plan. */
  outlineOwner: Pane | null;
  readonly panes: Map<number, Pane>;
}

/** Le plan passe à l'éditeur de la colonne active. */
function moveOutline(state: ColumnsState, outline: HTMLElement) {
  const active = state.panes.get(state.columns.active) as Pane;
  if (state.outlineOwner === active) return;
  state.outlineOwner?.editor.setOutline(null);
  active.editor.setOutline(outline);
  state.outlineOwner = active;
}

/** Ce que l'écran des colonnes demande, traduit en changements d'état. */
function viewHandlers(state: ColumnsState, deps: ColumnsDeps, open: OpenColumns): ColumnsHandlers {
  const update = (next: (now: Columns) => Columns) => deps.run(open.update(next));
  return {
    created: (id, parts) => state.panes.set(id, deps.newPane(parts)),
    removed: (id) => {
      const pane = state.panes.get(id) as Pane;
      if (state.outlineOwner === pane) state.outlineOwner = null;
      pane.destroy();
      state.panes.delete(id);
    },
    activate: (id) => {
      if (id !== state.columns.active) update((now) => columnActivated(now, id));
    },
    activateTab: (tabId) => update((now) => tabActivated(now, tabId)),
    closeTab: (tabId) => update((now) => tabClosed(now, tabId)),
    placeTab: (tabId, placement) => update((now) => tabPlaced(now, tabId, placement)),
    printNote: (path) => deps.printNote(path),
    dropTab: (tabId, drop) =>
      deps.run(open.changeFlushed(() => tabDropped(state.columns, tabId, drop))),
    split: () => deps.run(open.split()),
    resize: (divider, delta) => update((now) => columnsResized(now, divider, delta)),
  };
}

export function createOpenColumns(deps: ColumnsDeps): OpenColumns {
  const state: ColumnsState = { columns: columnsStarted, outlineOwner: null, panes: new Map() };
  const flushAll = async () => {
    await Promise.all([...state.panes.values()].map((pane) => pane.flush()));
  };
  const change = async (next: Columns) => {
    state.columns = next;
    view.render(state.columns);
    deps.changed(state.columns);
    moveOutline(state, deps.outline);
    const screen = deps.screen.get();
    const active = activeNote(state.columns);
    if (selectedNote(screen) !== active) deps.screen.show(noteSelected(screen, active));
    await Promise.all(
      state.columns.list.map((column) =>
        (state.panes.get(column.id) as Pane).load(shownNote(column)),
      ),
    );
  };
  const changeFlushed = async (next: () => Columns) => {
    await flushAll();
    await change(next());
  };
  const open: OpenColumns = {
    current: () => state.columns,
    change,
    update: (next) => change(next(state.columns)),
    changeFlushed,
    split: () => changeFlushed(() => columnSplit(state.columns)),
    flushAll,
    flushedPath: async (path) => {
      const showing = [...state.panes.values()].find((pane) => pane.note() === path);
      await flushAll();
      return showing?.note() ?? path;
    },
    activePane: () => state.panes.get(state.columns.active) as Pane,
    panes: () => state.panes,
    forget: (gone) =>
      state.panes.forEach((pane) => {
        const note = pane.note();
        if (note !== null && gone(note)) pane.forget();
      }),
    showNote: (path) => change(noteShown(state.columns, path)),
    openNote: (path) => change(noteOpened(state.columns, path)),
  };
  const view = createColumnsView(deps.container, viewHandlers(state, deps, open));
  return open;
}
