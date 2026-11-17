// Colonnes d'édition et leurs onglets : un état pur, que l'écran ne fait que montrer
// (voir la fiche de décision 0017).

/** Nombre de colonnes au plus, côte à côte. */
export const MAX_COLUMNS = 3;

/** Part de la zone d'édition qu'une colonne garde au moins quand on glisse un séparateur. */
export const MIN_COLUMN_WIDTH = 0.15;

/** Un onglet : son identifiant stable, sa note, et son titre une fois la note lue. */
export interface Tab {
  readonly id: number;
  readonly note: string;
  readonly title: string | null;
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
 * note (dossier vide), rien ne change.
 */
export function noteShown(columns: Columns, note: string | null): Columns {
  if (note === null) return columns;
  const column = activeColumn(columns);
  const open = column.tabs.find((tab) => tab.note === note);
  if (open) return tabActivated(columns, open.id);
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
          tabs: c.tabs.map((tab) => (tab.id === c.activeTab ? { ...tab, note, title: null } : tab)),
        },
  );
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

/** Un côté de la colonne active. */
type Side = "left" | "right";

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
function columnClosed(columns: Columns, id: number): Columns {
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
  return tabsChanged(columns, (tab) => ({ ...tab, note: moved(tab.note) }));
}

/** Les onglets de cette note prennent son titre, tel que Rust l'a lu ou enregistré. */
export function noteTitled(columns: Columns, note: string, title: string): Columns {
  return tabsChanged(columns, (tab) => (tab.note === note ? { ...tab, title } : tab));
}

/** Des notes ont quitté la bibliothèque (corbeille) : leurs onglets se ferment. */
export function notesRemoved(columns: Columns, removed: (path: string) => boolean): Columns {
  return changed(columns, (column) => tabsKept(column, (tab) => !removed(tab.note)));
}
