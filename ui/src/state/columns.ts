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
  const column = activeColumn(columns);
  const open = column.tabs.find((tab) => tab.note === note);
  if (open) return tabActivated(columns, open.id);
  const tab: Tab = { id: columns.nextId, note, title: null };
  const at = column.tabs.findIndex((t) => t.id === column.activeTab) + 1;
  const tabs = [...column.tabs.slice(0, at), tab, ...column.tabs.slice(at)];
  const next = changed(columns, (c) =>
    c.id === column.id ? { ...c, tabs, activeTab: tab.id } : c,
  );
  return { ...next, nextId: columns.nextId + 1 };
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

/** L'onglet se ferme ; s'il était actif, son voisin de droite (sinon de gauche) le devient. */
export function tabClosed(columns: Columns, tabId: number): Columns {
  return changed(columns, (column) => tabsKept(column, (tab) => tab.id !== tabId));
}

/**
 * Une nouvelle colonne s'ouvre à droite de la colonne active, avec la moitié de sa largeur, sur
 * la même note dans un onglet à elle, et devient active. Rien ne change au-delà de trois colonnes.
 */
export function columnSplit(columns: Columns): Columns {
  if (columns.list.length >= MAX_COLUMNS) return columns;
  const source = activeColumn(columns);
  const half = source.width / 2;
  const copied = source.tabs.find((tab) => tab.id === source.activeTab);
  const tabId = columns.nextId + 1;
  const added: Column = {
    id: columns.nextId,
    tabs: copied ? [{ ...copied, id: tabId }] : [],
    activeTab: copied ? tabId : null,
    width: half,
  };
  const list = columns.list.flatMap((column) =>
    column.id === source.id ? [{ ...column, width: half }, added] : [column],
  );
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
