// Largeur des panneaux : celle de la liste des dossiers, celle de la liste des notes et celle de
// la colonne Claude Code, réglées en tirant leur bord ; gardées d'un lancement à l'autre, les mêmes pour tous les espaces
// de travail. Le minimum et le maximum viennent du thème : ici, seulement ce qui est gardé.
import type { PreferenceStorage } from "./focus-preference";

/** Les panneaux dont la largeur se règle : les deux panneaux latéraux et la colonne Claude Code. */
export type Panel = "folders" | "notes" | "claude";

const key = (panel: Panel) => `malorean.panel-width.${panel}`;

/** La largeur gardée, en pixels ; rien s'il n'y en a pas, si elle est illisible ou refusée. */
export function loadPanelWidth(storage: PreferenceStorage, panel: Panel): number | null {
  try {
    const width = Number(storage.getItem(key(panel)));
    return Number.isFinite(width) && width > 0 ? width : null;
  } catch {
    return null;
  }
}

/** Garde la largeur, arrondie au pixel ; sans effet si le stockage est refusé. */
export function savePanelWidth(storage: PreferenceStorage, panel: Panel, width: number): void {
  try {
    storage.setItem(key(panel), String(Math.round(width)));
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}

/** Oublie la largeur gardée : le panneau reprend sa largeur par défaut. */
export function forgetPanelWidth(storage: PreferenceStorage, panel: Panel): void {
  try {
    storage.removeItem(key(panel));
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}
