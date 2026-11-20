// Réglage du mode focus : arrêté, phrase ou paragraphe ; gardé d'un lancement à l'autre.
import type { FocusUnit } from "../editor/focus/focus-range";

const KEY = "malorean.focus";
const UNITS: readonly FocusUnit[] = ["sentence", "paragraph"];

/** Là où le réglage est gardé : le stockage de l'interface, qui peut être refusé. */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Le réglage suivant, dans l'ordre : arrêté, phrase, paragraphe, arrêté. */
export function nextFocusUnit(unit: FocusUnit | null): FocusUnit | null {
  if (unit === null) return "sentence";
  return unit === "sentence" ? "paragraph" : null;
}

/** Le réglage gardé ; arrêté s'il n'y en a pas ou si le stockage est refusé. */
export function loadFocusUnit(storage: PreferenceStorage): FocusUnit | null {
  try {
    const stored = storage.getItem(KEY);
    return UNITS.find((unit) => unit === stored) ?? null;
  } catch {
    return null;
  }
}

/** Garde le réglage ; sans effet si le stockage est refusé (le mode reste actif jusqu'à la fermeture). */
export function saveFocusUnit(storage: PreferenceStorage, unit: FocusUnit | null): void {
  try {
    if (unit) storage.setItem(KEY, unit);
    else storage.removeItem(KEY);
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}
