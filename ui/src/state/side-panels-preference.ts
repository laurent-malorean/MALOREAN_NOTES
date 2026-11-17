// Réglage des panneaux latéraux : montrés ou cachés ; gardé d'un lancement à l'autre.
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.side-panels";

/** Les listes des dossiers et des notes sont-elles à l'écran ? */
export type SidePanels = "shown" | "hidden";

/** L'autre état des panneaux. */
export function nextSidePanels(panels: SidePanels): SidePanels {
  return panels === "shown" ? "hidden" : "shown";
}

/** Le réglage gardé ; montrés s'il n'y en a pas ou si le stockage est refusé. */
export function loadSidePanels(storage: PreferenceStorage): SidePanels {
  try {
    return storage.getItem(KEY) === "hidden" ? "hidden" : "shown";
  } catch {
    return "shown";
  }
}

/** Garde le réglage ; sans effet si le stockage est refusé. */
export function saveSidePanels(storage: PreferenceStorage, panels: SidePanels): void {
  try {
    if (panels === "hidden") storage.setItem(KEY, panels);
    else storage.removeItem(KEY);
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}
