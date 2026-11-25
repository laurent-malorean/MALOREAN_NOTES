// Hauteur de l'arborescence des dossiers : réglée en tirant la poignée de hauteur ; gardée d'un
// lancement à l'autre, la même pour tous les espaces de travail (comme la largeur d'un panneau).
// Le minimum et le maximum viennent de la mise en page : ici, seulement ce qui est gardé.
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.folders-tree-height";

/** La hauteur gardée, en pixels ; rien s'il n'y en a pas, si elle est illisible ou refusée. */
export function loadFoldersTreeHeight(storage: PreferenceStorage): number | null {
  try {
    const height = Number(storage.getItem(KEY));
    return Number.isFinite(height) && height > 0 ? height : null;
  } catch {
    return null;
  }
}

/** Garde la hauteur, arrondie au pixel ; sans effet si le stockage est refusé. */
export function saveFoldersTreeHeight(storage: PreferenceStorage, height: number): void {
  try {
    storage.setItem(KEY, String(Math.round(height)));
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}

/** Oublie la hauteur gardée : l'arborescence reprend la hauteur par défaut. */
export function forgetFoldersTreeHeight(storage: PreferenceStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}
