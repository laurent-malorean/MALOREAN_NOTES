// Glisser dans le Kanban (fiche 0060, spécification § 7.1) : où tombe une carte lâchée, où tombe
// l'en-tête d'une étape. Des calculs sur des rectangles ; l'écran les mesure, Rust écrit le rang.
import type { ColumnItem, PlacementItem } from "../bridge";

/** Une carte montrée dans une colonne : sa référence et sa place verticale à l'écran. */
export interface CardRect {
  readonly name: string;
  readonly top: number;
  readonly height: number;
}

/** La carte devant laquelle tombe un dépôt à la hauteur `y` : la première dont le milieu est plus bas. `null` : tout en bas. */
export function nextCard(rects: readonly CardRect[], y: number): string | null {
  return rects.find((rect) => y < rect.top + rect.height / 2)?.name ?? null;
}

/** Une carte lâchée : d'où elle vient, dans quelle colonne, devant quelle carte. */
export interface Drop {
  readonly dragged: string;
  /** La colonne d'où la carte est prise. */
  readonly from: string;
  readonly target: ColumnItem;
  /** La carte devant laquelle elle tombe, sans elle-même ; `null` : tout en bas. */
  readonly next: string | null;
  /** Un filtre est actif : des cartes cachées rendraient la place fausse. */
  readonly filtered: boolean;
}

/** Ce que le dépôt change, ou `null` s'il ne change rien. */
export interface Move {
  readonly status: string;
  readonly placement: PlacementItem;
}

/** La place d'une carte lâchée : jamais placée dans une colonne terminée ou pendant un filtre. */
export function dropMove(drop: Drop): Move | null {
  const { target } = drop;
  const placed = !target.closed && !drop.filtered;
  const placement: PlacementItem = placed
    ? { kind: "before", card: drop.next }
    : { kind: "unplaced" };
  if (target.status === drop.from) {
    if (!placed) return null;
    const after = target.cards[target.cards.indexOf(drop.dragged) + 1] ?? null;
    if (after === drop.next) return null;
  }
  return { status: target.status, placement };
}

/** Une étape montrée : son nom et sa place horizontale à l'écran. */
export interface StageRect {
  readonly stage: string;
  readonly left: number;
  readonly width: number;
}

/** La place (à partir de 0) que prend l'étape glissée si on la lâche à l'abscisse `x` : parmi les autres étapes, après celles dont le milieu est à gauche. */
export function stagePlace(others: readonly StageRect[], x: number): number {
  return others.filter((rect) => rect.left + rect.width / 2 < x).length;
}
