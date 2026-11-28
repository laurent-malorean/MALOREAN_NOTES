// Numéros d'une liste numérotée refaits dans l'ordre (spécification « deplacer-un-bloc », § 5.1).

/** Un bloc de la note, dans l'ordre où il sera : `listId` est `null` s'il n'est pas un élément de liste. */
export interface Row {
  readonly ordered: boolean;
  readonly indent: number;
  readonly listId: number | null;
  /** Le numéro de départ du groupe d'éléments voisins où il se trouve. */
  readonly start: number;
}

interface Group {
  readonly indent: number;
  next: number;
}

/** Le numéro de la ligne (`null` pour une puce), les groupes ouverts mis à jour. */
function numberOf(groups: Group[], row: Row): number | null {
  const limit = row.ordered ? row.indent + 1 : row.indent;
  while (groups.length > 0 && (groups.at(-1) as Group).indent >= limit) groups.pop();
  if (!row.ordered) return null;
  const top = groups.at(-1);
  if (top?.indent === row.indent) return top.next++;
  groups.push({ indent: row.indent, next: row.start + 1 });
  return row.start;
}

/**
 * Le numéro que doit porter chaque élément numéroté des listes de `affected`, `null` pour les autres
 * lignes. Les éléments voisins d'un même niveau se suivent à partir du numéro de départ du groupe ; un
 * sous-élément a sa propre suite ; une puce au même niveau, un autre bloc ou une autre liste la
 * recommencent.
 */
export function renumbered(rows: readonly Row[], affected: ReadonlySet<number>): (number | null)[] {
  let groups: Group[] = [];
  let current: number | null = null;
  return rows.map((row) => {
    if (row.listId !== current) {
      groups = [];
      current = row.listId;
    }
    if (row.listId === null) return null;
    const number = numberOf(groups, row);
    return affected.has(row.listId) ? number : null;
  });
}
