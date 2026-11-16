// Ce que l'utilisateur est en train de glisser d'une colonne à l'autre, s'il glisse quelque chose.

let current: string | null = null;

/** Le glissement du dossier `path` commence. */
export function startDragging(path: string): void {
  current = path;
}

/** Le glissement s'arrête, déposé ou abandonné. */
export function stopDragging(): void {
  current = null;
}

/** Le chemin de ce qui est en cours de glissement, s'il y a quelque chose. */
export function dragged(): string | null {
  return current;
}
