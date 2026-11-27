// Onglets de l'écran de réglages : quelles parties dans quel onglet, la navigation aux flèches, et
// le dernier onglet ouvert, gardé d'un lancement à l'autre.
import type { PreferenceStorage } from "./focus-preference";

/** Un onglet : son nom, et les parties de l'écran (par leur titre) qu'il regroupe, dans l'ordre. */
export interface SettingsTab {
  readonly name: string;
  readonly groups: readonly string[];
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { name: "Affichage", groups: ["Affichage"] },
  { name: "Écriture", groups: ["Écriture", "Modèles", "Journal"] },
  { name: "Claude", groups: ["Claude"] },
  { name: "Index", groups: ["Index", "Recherche par le sens"] },
  { name: "Saisie vocale", groups: ["Saisie vocale"] },
  { name: "Favoris", groups: ["Favoris"] },
  { name: "Brancher une IA", groups: ["Brancher une IA"] },
];

const KEY = "malorean.settings-tab";

/** Les parties de chaque onglet, dans l'ordre reçu ; une partie inconnue va au premier onglet. */
export function placeInTabs<T extends { readonly name: string }>(groups: readonly T[]): T[][] {
  const tabs: T[][] = SETTINGS_TABS.map(() => []);
  for (const group of groups) {
    const found = SETTINGS_TABS.findIndex((tab) => tab.groups.includes(group.name));
    (tabs[Math.max(found, 0)] as T[]).push(group);
  }
  return tabs;
}

/** L'onglet où mène cette touche depuis l'onglet `current`, ou rien si elle n'en change pas. */
export function tabMoved(current: number, key: string, count: number): number | null {
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current + count - 1) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Le dernier onglet ouvert ; le premier si rien n'est gardé, si c'est illisible ou refusé. */
export function loadSettingsTab(storage: PreferenceStorage): number {
  try {
    const stored = storage.getItem(KEY);
    return Math.max(
      SETTINGS_TABS.findIndex((tab) => tab.name === stored),
      0,
    );
  } catch {
    return 0;
  }
}

/** Garde l'onglet ouvert ; sans effet si le stockage est refusé. */
export function saveSettingsTab(storage: PreferenceStorage, index: number): void {
  try {
    storage.setItem(KEY, (SETTINGS_TABS[index] as SettingsTab).name);
  } catch {
    // Préférence de confort : la perdre n'empêche rien.
  }
}
