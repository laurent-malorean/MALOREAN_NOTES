// Colonnes d'édition et leurs onglets : un état pur, que l'écran ne fait que montrer
// (voir la fiche de décision 0017).

import type { WorkspaceNoteItem } from "../bridge/generated/WorkspaceNoteItem";
import {
  type NotePosition,
  noteVisited,
  type Trail,
  trailForgotten,
  trailMoved,
  type TrailStep,
  trailWalked,
} from "./trail";

/** Nombre de colonnes au plus, côte à côte. */
export const MAX_COLUMNS = 3;

/** Part de la zone d'édition qu'une colonne garde au moins quand on glisse un séparateur. */
export const MIN_COLUMN_WIDTH = 0.15;

/** Un onglet : son identifiant stable, sa note, son titre une fois la note lue, et son parcours. */
export interface Tab {
  readonly id: number;
  readonly note: string;
  readonly title: string | null;
  /** Les notes montrées avant et après la sienne ; aucun tant qu'il n'a pas changé de note. */
  readonly trail?: Trail;
}

/** Une colonne : son identifiant stable, ses onglets, son onglet actif (aucun sans onglet) et sa largeur. */
export interface Column {
  readonly id: number;
  readonly tabs: readonly Tab[];
  readonly activeTab: number | null;
  /** Part de la zone d'édition ; les parts de toutes les colonnes font 1. */
  readonly width: number;
}

/**
 * Les colonnes de gauche à droite, la colonne active, et le prochain identifiant libre, commun
 * aux colonnes et aux onglets.
 */
export interface Columns {
  readonly list: readonly Column[];
  readonly active: number;
  readonly nextId: number;
}

/** Au lancement : une seule colonne, toute la largeur, sans onglet. */
export const columnsStarted: Columns = {
  list: [{ id: 0, tabs: [], activeTab: null, width: 1 }],
  active: 0,
  nextId: 1,
};

/** La colonne active. */
export function activeColumn(columns: Columns): Column {
  // Stryker disable next-line all: l'état garantit que la colonne active existe ; la seconde branche n'est là que pour TypeScript.
  return columns.list.find((column) => column.id === columns.active) ?? (columns.list[0] as Column);
}

/** La note que montre une colonne : celle de son onglet actif, s'il y en a un. */
export function shownNote(column: Column): string | null {
  return column.tabs.find((tab) => tab.id === column.activeTab)?.note ?? null;
}

/** La note que montre la colonne active, s'il y en a une. */
export function activeNote(columns: Columns): string | null {
  return shownNote(activeColumn(columns));
}

function changed(columns: Columns, change: (column: Column) => Column): Columns {
  return { ...columns, list: columns.list.map(change) };
}

/** Ne garde que les onglets voulus ; si l'onglet actif part, son voisin de droite (sinon de gauche) le remplace. */
function tabsKept(column: Column, keep: (tab: Tab) => boolean): Column {
  const tabs = column.tabs.filter(keep);
  if (tabs.length === column.tabs.length) return column;
  const index = column.tabs.findIndex((tab) => tab.id === column.activeTab);
  const stays = tabs.some((tab) => tab.id === column.activeTab);
  // À droite, le premier onglet gardé ; sinon, tous les gardés sont à gauche : le dernier.
  const neighbour = column.tabs.slice(index + 1).find(keep) ?? tabs.at(-1);
  return { ...column, tabs, activeTab: stays ? column.activeTab : (neighbour?.id ?? null) };
}

/**
 * L'onglet actif de la colonne active montre une autre note ; s'il n'y a pas d'onglet, il s'en
 * ouvre un. Si la note est déjà dans un onglet de la colonne, cet onglet devient actif. Sans
 * note (dossier vide), rien ne change. La note quittée entre dans le parcours de l'onglet, avec
 * `position`, où l'on y en était.
 */
export function noteShown(
  columns: Columns,
  note: string | null,
  position: NotePosition | null = null,
): Columns {
  if (note === null) return columns;
  const open = activeColumn(columns).tabs.find((tab) => tab.note === note);
  return open ? tabActivated(columns, open.id) : noteFollowed(columns, note, position);
}

/**
 * Suivre un lien : l'onglet actif de la colonne active montre la note, même si elle est ouverte
 * dans un autre onglet ; la note quittée entre dans son parcours, avec `position`. Sans onglet,
 * il s'en ouvre un ; sur la note déjà montrée, rien ne change.
 */
export function noteFollowed(
  columns: Columns,
  note: string,
  position: NotePosition | null,
): Columns {
  const column = activeColumn(columns);
  if (column.activeTab === null) {
    const tab: Tab = { id: columns.nextId, note, title: null };
    const next = changed(columns, (c) =>
      c.id === column.id ? { ...c, tabs: [tab], activeTab: tab.id } : c,
    );
    return { ...next, nextId: columns.nextId + 1 };
  }
  return changed(columns, (c) =>
    c.id !== column.id
      ? c
      : {
          ...c,
          tabs: c.tabs.map((tab) =>
            tab.id === c.activeTab && tab.note !== note ? noteVisited(tab, note, position) : tab,
          ),
        },
  );
}

/**
 * L'onglet actif de la colonne `columnId` revient à la note précédente de son parcours (`-1`) ou
 * repart vers la suivante (`1`), et devient actif ; la note quittée, avec `position`, passe de
 * l'autre côté. Sans note de ce côté, ou sans onglet, rien ne change.
 */
export function columnWalked(
  columns: Columns,
  columnId: number,
  step: TrailStep,
  position: NotePosition | null,
): Columns {
  const column = columns.list.find((c) => c.id === columnId);
  if (column === undefined || column.activeTab === null) return columns;
  const next = changed(columns, (c) =>
    c.id !== columnId
      ? c
      : {
          ...c,
          tabs: c.tabs.map((tab) =>
            tab.id === c.activeTab ? trailWalked(tab, step, position) : tab,
          ),
        },
  );
  return tabActivated(next, column.activeTab);
}

/**
 * Ouvre une note dans la colonne active : un nouvel onglet juste après l'onglet actif, qui devient
 * actif. Si la note est déjà dans un onglet de la colonne, cet onglet devient actif.
 */
export function noteOpened(columns: Columns, note: string): Columns {
  const open = activeColumn(columns).tabs.find((tab) => tab.note === note);
  return open ? tabActivated(columns, open.id) : tabAdded(columns, note);
}

/** Le titre de la note, si l'un de ses onglets le connaît déjà. */
function knownTitle(columns: Columns, note: string): string | null {
  const tabs = columns.list.flatMap((column) => column.tabs);
  return tabs.find((tab) => tab.note === note && tab.title !== null)?.title ?? null;
}

/**
 * Un nouvel onglet sur la note, juste après l'onglet actif de la colonne active, qui devient actif ;
 * il prend le titre de la note si un autre onglet le connaît.
 */
function tabAdded(columns: Columns, note: string): Columns {
  const column = activeColumn(columns);
  const tab: Tab = { id: columns.nextId, note, title: knownTitle(columns, note) };
  const at = column.tabs.findIndex((t) => t.id === column.activeTab) + 1;
  const tabs = [...column.tabs.slice(0, at), tab, ...column.tabs.slice(at)];
  const next = changed(columns, (c) =>
    c.id === column.id ? { ...c, tabs, activeTab: tab.id } : c,
  );
  return { ...next, nextId: columns.nextId + 1 };
}

/** Où le menu d'une note l'ouvre : un nouvel onglet de la colonne active, ou la colonne voisine. */
export type Placement = "newTab" | Side;

/** Un côté d'une colonne. */
export type Side = "left" | "right";

/**
 * Ouvre la note à l'emplacement choisi. Dans un nouvel onglet : un onglet de plus dans la colonne
 * active, même si la note y est déjà. À gauche ou à droite : dans la colonne voisine, qui devient
 * active ; sans voisine de ce côté, une colonne s'y ouvre, ou, à trois colonnes, la note prend un
 * nouvel onglet de la colonne active.
 */
export function notePlaced(columns: Columns, note: string, placement: Placement): Columns {
  if (placement === "newTab") return tabAdded(columns, note);
  const index = columns.list.findIndex((column) => column.id === columns.active);
  const neighbour = columns.list[placement === "left" ? index - 1 : index + 1];
  if (neighbour) return noteOpened(columnActivated(columns, neighbour.id), note);
  if (columns.list.length >= MAX_COLUMNS) return tabAdded(columns, note);
  return columnAdded(columns, placement, { note, title: knownTitle(columns, note) });
}

/** Le menu d'un onglet ouvre sa note, à partir de la colonne de l'onglet ; un onglet inconnu ne change rien. */
export function tabPlaced(columns: Columns, tabId: number, placement: Placement): Columns {
  for (const column of columns.list) {
    const tab = column.tabs.find((t) => t.id === tabId);
    if (tab) return notePlaced(columnActivated(columns, column.id), tab.note, placement);
  }
  return columns;
}

/** L'onglet de cette note dans la colonne active se ferme ; s'il n'y en a pas, rien ne change. */
export function noteClosed(columns: Columns, note: string): Columns {
  const tab = activeColumn(columns).tabs.find((t) => t.note === note);
  return tab ? tabClosed(columns, tab.id) : columns;
}

/** La colonne où l'on vient de cliquer devient la colonne active ; un identifiant inconnu ne change rien. */
export function columnActivated(columns: Columns, id: number): Columns {
  return columns.list.some((column) => column.id === id) ? { ...columns, active: id } : columns;
}

/** L'onglet cliqué devient actif, et sa colonne aussi ; un onglet inconnu ne change rien. */
export function tabActivated(columns: Columns, tabId: number): Columns {
  const column = columns.list.find((c) => c.tabs.some((tab) => tab.id === tabId));
  if (column === undefined) return columns;
  return {
    ...changed(columns, (c) => (c.id === column.id ? { ...c, activeTab: tabId } : c)),
    active: column.id,
  };
}

/**
 * L'onglet voisin de l'onglet actif, à droite (`1`) ou à gauche (`-1`), dans la colonne active,
 * devient actif ; après le dernier revient le premier, et inversement. Sans onglet, rien ne change.
 */
export function tabStepped(columns: Columns, step: 1 | -1): Columns {
  const { tabs, activeTab } = activeColumn(columns);
  const index = tabs.findIndex((tab) => tab.id === activeTab);
  const next = tabs[(index + step + tabs.length) % tabs.length];
  return next ? tabActivated(columns, next.id) : columns;
}

/** L'onglet actif de la colonne active se ferme ; sans onglet, rien ne change. */
export function activeTabClosed(columns: Columns): Columns {
  const { activeTab } = activeColumn(columns);
  return activeTab === null ? columns : tabClosed(columns, activeTab);
}

/**
 * L'onglet se ferme ; s'il était actif, son voisin de droite (sinon de gauche) le devient. Fermer
 * le dernier onglet d'une colonne ferme la colonne, sauf s'il ne reste qu'elle.
 */
export function tabClosed(columns: Columns, tabId: number): Columns {
  const next = changed(columns, (column) => tabsKept(column, (tab) => tab.id !== tabId));
  const emptied = columns.list.find((column) => {
    const [only, ...others] = column.tabs;
    return only?.id === tabId && others.length === 0;
  });
  return emptied && columns.list.length > 1 ? columnClosed(next, emptied.id) : next;
}

/**
 * La colonne se ferme : ses voisines se partagent sa largeur. Si elle était active, sa voisine de
 * droite (sinon de gauche) le devient.
 */
export function columnClosed(columns: Columns, id: number): Columns {
  const index = columns.list.findIndex((column) => column.id === id);
  const closed = columns.list[index] as Column;
  const neighbours = [columns.list[index - 1], columns.list[index + 1]].filter(
    (column) => column !== undefined,
  );
  const share = closed.width / neighbours.length;
  const list = columns.list
    .filter((column) => column.id !== id)
    .map((column) =>
      neighbours.includes(column) ? { ...column, width: column.width + share } : column,
    );
  const active = columns.active === id ? (neighbours.at(-1) as Column).id : columns.active;
  return { ...columns, list, active };
}

/**
 * Où l'on lâche un onglet qu'on glisse : dans une colonne, avant l'un de ses onglets (à la fin
 * sans onglet désigné), ou au bord d'une colonne, d'un côté.
 */
export type TabDrop =
  | { readonly column: number; readonly before: number | null }
  | { readonly column: number; readonly side: Side };

/**
 * L'onglet glissé quitte sa colonne, qui se ferme s'il était son dernier. Dans une colonne, il se
 * place avant l'onglet désigné (sinon à la fin) et y devient actif. Au bord d'une colonne, une
 * colonne s'ouvre de ce côté pour lui, s'il reste de la place. La colonne qui le reçoit devient
 * active. Un onglet ou une colonne inconnus, ou un onglet seul lâché dans sa colonne, ne changent rien.
 */
export function tabDropped(columns: Columns, tabId: number, drop: TabDrop): Columns {
  const source = columns.list.find((c) => c.tabs.some((t) => t.id === tabId));
  const target = columns.list.find((c) => c.id === drop.column);
  if (source === undefined || target === undefined) return columns;
  if (source.id === target.id && source.tabs.length === 1) return columns;
  if ("before" in drop && drop.before === tabId) return columns;
  const tab = source.tabs.find((t) => t.id === tabId) as Tab;
  const left = tabClosed(columns, tabId);
  if ("side" in drop) {
    if (left.list.length >= MAX_COLUMNS) return columns;
    return columnAdded(columnActivated(left, target.id), drop.side, tab);
  }
  const next = changed(left, (c) => {
    if (c.id !== target.id) return c;
    const at = c.tabs.findIndex((t) => t.id === drop.before);
    const tabs = at < 0 ? [...c.tabs, tab] : [...c.tabs.slice(0, at), tab, ...c.tabs.slice(at)];
    return { ...c, tabs, activeTab: tabId };
  });
  return { ...next, active: target.id };
}

/**
 * Une nouvelle colonne s'ouvre à droite de la colonne active, avec la moitié de sa largeur, sur
 * la même note dans un onglet à elle, et devient active. Rien ne change au-delà de trois colonnes.
 */
export function columnSplit(columns: Columns): Columns {
  if (columns.list.length >= MAX_COLUMNS) return columns;
  const source = activeColumn(columns);
  return columnAdded(
    columns,
    "right",
    source.tabs.find((tab) => tab.id === source.activeTab),
  );
}

/**
 * Une colonne s'ouvre du côté voulu de la colonne active, avec la moitié de sa largeur, et devient
 * active ; elle a un onglet sur la note donnée, ou aucun.
 */
function columnAdded(columns: Columns, side: Side, shown: Omit<Tab, "id"> | undefined): Columns {
  const source = activeColumn(columns);
  const half = source.width / 2;
  const tabId = columns.nextId + 1;
  const added: Column = {
    id: columns.nextId,
    tabs: shown ? [{ ...shown, id: tabId }] : [],
    activeTab: shown ? tabId : null,
    width: half,
  };
  const list = columns.list.flatMap((column) => {
    if (column.id !== source.id) return [column];
    const halved = { ...column, width: half };
    return side === "right" ? [halved, added] : [added, halved];
  });
  return { list, active: added.id, nextId: columns.nextId + 2 };
}

/**
 * Le séparateur `divider` (0 entre la première et la deuxième colonne) glisse de `delta`, en part
 * de la zone d'édition, vers la droite si positif : la colonne de gauche gagne ce que perd celle de
 * droite, et aucune ne descend sous la largeur minimale.
 */
export function columnsResized(columns: Columns, divider: number, delta: number): Columns {
  const left = columns.list[divider];
  const right = columns.list[divider + 1];
  if (left === undefined || right === undefined) return columns;
  const moved = Math.min(
    Math.max(delta, MIN_COLUMN_WIDTH - left.width),
    right.width - MIN_COLUMN_WIDTH,
  );
  return changed(columns, (column) => {
    if (column.id === left.id) return { ...column, width: left.width + moved };
    return column.id === right.id ? { ...column, width: right.width - moved } : column;
  });
}

function tabsChanged(columns: Columns, change: (tab: Tab) => Tab): Columns {
  return changed(columns, (column) => ({ ...column, tabs: column.tabs.map(change) }));
}

/** Les notes ont changé de chemin (renommage, déplacement d'une note ou d'un dossier) : leurs onglets suivent. */
export function notesMoved(columns: Columns, moved: (path: string) => string): Columns {
  return tabsChanged(columns, (tab) => trailMoved({ ...tab, note: moved(tab.note) }, moved));
}

/** Les onglets de cette note prennent son titre, tel que Rust l'a lu ou enregistré. */
export function noteTitled(columns: Columns, note: string, title: string): Columns {
  return tabsChanged(columns, (tab) => (tab.note === note ? { ...tab, title } : tab));
}

/**
 * Les onglets encore sans titre prennent celui que l'écran connaît déjà (`titleOf`, par exemple la
 * liste des notes) : un onglet a son titre dès qu'il s'ouvre, même si sa note n'est jamais montrée
 * (une autre a été cliquée avant la fin de sa lecture). Un titre déjà connu de l'onglet reste : il
 * vient de la note lue.
 */
export function titlesKnown(
  columns: Columns,
  titleOf: (note: string) => string | undefined,
): Columns {
  return tabsChanged(columns, (tab) =>
    tab.title === null ? { ...tab, title: titleOf(tab.note) ?? null } : tab,
  );
}

/**
 * Des notes ont changé hors de l'application ; `workspace` est l'espace de travail après coup. Une seule
 * note ouverte partie et une seule note apparue (pas encore ouverte) : c'est un renommage, ses
 * onglets la suivent. Puis chaque note ouverte annoncée prend son titre dans tous ses onglets.
 */
export function notesChangedOutside(
  columns: Columns,
  changed: readonly string[],
  workspace: readonly Pick<WorkspaceNoteItem, "path" | "title">[],
): Columns {
  const open = new Set(columns.list.flatMap((column) => column.tabs.map((tab) => tab.note)));
  const titles = new Map(workspace.map((note) => [note.path, note.title]));
  const gone = changed.filter((path) => open.has(path) && !titles.has(path));
  const appeared = changed.filter((path) => !open.has(path) && titles.has(path));
  const [from, to] = [gone[0], appeared[0]];
  const renamed =
    gone.length === 1 && appeared.length === 1
      ? notesMoved(columns, (path) => (path === from ? (to as string) : path))
      : columns;
  return changed.reduce((next, path) => {
    const title = titles.get(path);
    return title === undefined ? next : noteTitled(next, path, title);
  }, renamed);
}

/** Des notes ont quitté l'espace de travail (corbeille) : leurs onglets se ferment, les parcours les oublient. */
export function notesRemoved(columns: Columns, removed: (path: string) => boolean): Columns {
  const kept = changed(columns, (column) => tabsKept(column, (tab) => !removed(tab.note)));
  return tabsChanged(kept, (tab) => trailForgotten(tab, removed));
}
