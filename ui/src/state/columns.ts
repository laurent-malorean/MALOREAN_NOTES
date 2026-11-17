// Colonnes d'édition : un état pur, que l'écran ne fait que montrer (voir la fiche de décision 0017).

/** Nombre de colonnes au plus, côte à côte. */
export const MAX_COLUMNS = 3;

/** Part de la zone d'édition qu'une colonne garde au moins quand on glisse un séparateur. */
export const MIN_COLUMN_WIDTH = 0.15;

/** Une colonne : son identifiant stable, la note qu'elle montre (ou aucune) et sa largeur. */
export interface Column {
  readonly id: number;
  readonly note: string | null;
  /** Part de la zone d'édition ; les parts de toutes les colonnes font 1. */
  readonly width: number;
}

/** Les colonnes de gauche à droite, la colonne active, et l'identifiant de la prochaine colonne. */
export interface Columns {
  readonly list: readonly Column[];
  readonly active: number;
  readonly nextId: number;
}

/** Au lancement : une seule colonne, toute la largeur, sans note. */
export const columnsStarted: Columns = {
  list: [{ id: 0, note: null, width: 1 }],
  active: 0,
  nextId: 1,
};

/** La colonne active. */
export function activeColumn(columns: Columns): Column {
  // Stryker disable next-line all: l'état garantit que la colonne active existe ; la seconde branche n'est là que pour TypeScript.
  return columns.list.find((column) => column.id === columns.active) ?? (columns.list[0] as Column);
}

/** La note que montre la colonne active, s'il y en a une. */
export function activeNote(columns: Columns): string | null {
  return activeColumn(columns).note;
}

function changed(columns: Columns, change: (column: Column) => Column): Columns {
  return { ...columns, list: columns.list.map(change) };
}

/** La colonne active montre une autre note (ou aucune). */
export function noteShown(columns: Columns, note: string | null): Columns {
  return changed(columns, (column) =>
    column.id === columns.active ? { ...column, note } : column,
  );
}

/** La colonne où l'on vient de cliquer devient la colonne active ; un identifiant inconnu ne change rien. */
export function columnActivated(columns: Columns, id: number): Columns {
  return columns.list.some((column) => column.id === id) ? { ...columns, active: id } : columns;
}

/**
 * Une nouvelle colonne s'ouvre à droite de la colonne active, sur la même note, avec la moitié
 * de sa largeur, et devient active. Rien ne change au-delà de trois colonnes.
 */
export function columnSplit(columns: Columns): Columns {
  if (columns.list.length >= MAX_COLUMNS) return columns;
  const source = activeColumn(columns);
  const half = source.width / 2;
  const added: Column = { id: columns.nextId, note: source.note, width: half };
  const list = columns.list.flatMap((column) =>
    column.id === source.id ? [{ ...column, width: half }, added] : [column],
  );
  return { list, active: added.id, nextId: columns.nextId + 1 };
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

/** Les notes ont changé de chemin (renommage, déplacement d'une note ou d'un dossier). */
export function notesMoved(columns: Columns, moved: (path: string) => string): Columns {
  return changed(columns, (column) =>
    column.note === null ? column : { ...column, note: moved(column.note) },
  );
}

/** Des notes ont quitté la bibliothèque (corbeille) : les colonnes qui les montraient sont vides. */
export function notesRemoved(columns: Columns, removed: (path: string) => boolean): Columns {
  return changed(columns, (column) =>
    column.note !== null && removed(column.note) ? { ...column, note: null } : column,
  );
}
