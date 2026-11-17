// Réglage du mode machine à écrire : en marche ou arrêté ; gardé d'un lancement à l'autre.
import type { Typewriter } from "../editor/writing/typewriter";
import type { PreferenceStorage } from "./focus-preference";

const KEY = "malorean.typewriter";

/** L'autre état du mode. */
export function nextTypewriter(mode: Typewriter): Typewriter {
  return mode === "on" ? "off" : "on";
}

/** Le réglage gardé ; arrêté s'il n'y en a pas ou si le stockage est refusé. */
export function loadTypewriter(storage: PreferenceStorage): Typewriter {
  try {
    return storage.getItem(KEY) === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Garde le réglage ; sans effet si le stockage est refusé. */
export function saveTypewriter(storage: PreferenceStorage, mode: Typewriter): void {
  try {
    if (mode === "on") storage.setItem(KEY, mode);
    else storage.removeItem(KEY);
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}
