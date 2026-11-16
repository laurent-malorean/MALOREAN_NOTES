// Ce que l'utilisateur est en train de glisser d'une colonne à l'autre, s'il glisse quelque chose.

/** Un dossier ou une note en cours de glissement, désigné par son chemin. */
export interface Dragged {
  readonly kind: "folder" | "note";
  readonly path: string;
}

let current: Dragged | null = null;

/** Le glissement commence. */
export function startDragging(dragged: Dragged): void {
  current = dragged;
}

/** Le glissement s'arrête, déposé ou abandonné. */
export function stopDragging(): void {
  current = null;
}

/** Ce qui est en cours de glissement, s'il y a quelque chose. */
export function dragged(): Dragged | null {
  return current;
}
