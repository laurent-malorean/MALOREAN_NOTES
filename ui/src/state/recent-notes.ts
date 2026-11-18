// Notes récentes : les notes ouvertes le plus récemment dans l'espace de travail, la plus récente
// d'abord, sans doublon ; gardées pour chaque espace de travail.
import type { PreferenceStorage } from "./focus-preference";

/** Au-delà, la plus anciennement ouverte est oubliée. */
export const RECENT_NOTES_LIMIT = 10;

const KEY = "malorean.recent:";

/** Les chemins dans leur ordre, chacun à sa première place, la limite au plus. */
const distinct = (paths: readonly string[]) =>
  paths.filter((path, index) => paths.indexOf(path) === index).slice(0, RECENT_NOTES_LIMIT);

/** La note qu'on vient d'ouvrir passe en tête ; rien ne change si aucune note n'est montrée. */
export function noteVisited(recent: readonly string[], path: string | null): readonly string[] {
  return path === null ? recent : distinct([path, ...recent]);
}

/** Chaque note suit son nouveau chemin (renommage, déplacement de la note ou de son dossier). */
export function recentMoved(
  recent: readonly string[],
  rename: (path: string) => string,
): readonly string[] {
  return distinct(recent.map(rename));
}

/** Seules restent les notes que `kept` garde : les autres sont parties à la corbeille ou ont disparu. */
export function recentKept(
  recent: readonly string[],
  kept: (path: string) => boolean,
): readonly string[] {
  return recent.filter(kept);
}

/** Les notes récentes d'abord, de la plus récente à la plus ancienne, puis les autres dans leur ordre. */
export function recentFirst<T extends { readonly path: string }>(
  notes: readonly T[],
  recent: readonly string[],
): T[] {
  const first = recent.flatMap((path) => notes.filter((note) => note.path === path));
  return [...first, ...notes.filter((note) => !recent.includes(note.path))];
}

/** Les notes récentes gardées pour cet espace de travail ; aucune si rien n'est gardé, si c'est illisible ou refusé. */
export function loadRecent(storage: PreferenceStorage, workspace: string): string[] {
  let stored: unknown = null;
  try {
    // Rien de gardé : `JSON.parse(null)` donne `null`.
    stored = JSON.parse(storage.getItem(KEY + workspace) as string);
  } catch {
    // Valeur abîmée ou stockage refusé : comme si rien n'était gardé.
  }
  const readable = Array.isArray(stored) && stored.every((path) => typeof path === "string");
  return readable ? (stored as string[]).slice(0, RECENT_NOTES_LIMIT) : [];
}

/** Garde les notes récentes de cet espace de travail ; sans effet si le stockage est refusé. */
export function saveRecent(
  storage: PreferenceStorage,
  workspace: string,
  recent: readonly string[],
): void {
  try {
    if (recent.length === 0) storage.removeItem(KEY + workspace);
    else storage.setItem(KEY + workspace, JSON.stringify(recent));
  } catch {
    // Confort : le perdre vide seulement les notes récentes au lancement suivant.
  }
}
