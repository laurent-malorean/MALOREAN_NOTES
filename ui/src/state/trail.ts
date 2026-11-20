// Parcours d'un onglet : les notes qu'il a montrées avant et après la sienne, comme l'historique
// d'un onglet de navigateur ; « ← » revient à la note précédente, « → » repart vers la suivante.
import type { Tab } from "./columns";

/** Où l'on en est dans une note : la sélection, et la première ligne visible avec son décalage. */
export interface NotePosition {
  readonly anchor: number;
  readonly head: number;
  /** Le début de la première ligne visible, dans le texte. */
  readonly top: number;
  /** De combien de pixels le haut de la zone visible dépasse le haut de cette ligne. */
  readonly offset: number;
}

/** Une note vue dans l'onglet, et où l'on en était quand on l'a quittée. */
export interface Visit {
  readonly note: string;
  readonly position: NotePosition | null;
}

/** Les notes d'avant (la plus récente en dernier) et d'après (la plus proche en dernier). */
export interface Trail {
  readonly back: readonly Visit[];
  readonly forward: readonly Visit[];
}

/** Vers la note précédente (`-1`, « ← ») ou la suivante (`1`, « → »). */
export type TrailStep = -1 | 1;

const NO_TRAIL: Trail = { back: [], forward: [] };

/** Le parcours de l'onglet ; vide pour un onglet qui n'a jamais changé de note. */
export function trailOf(tab: Tab): Trail {
  return tab.trail ?? NO_TRAIL;
}

/** La note où mène le pas, et où l'on y en était ; rien s'il n'y a pas de note de ce côté. */
export function trailTarget(tab: Tab, step: TrailStep): Visit | null {
  const { back, forward } = trailOf(tab);
  return (step === -1 ? back : forward).at(-1) ?? null;
}

/**
 * L'onglet quitte sa note pour `note`, en un pas nouveau (lien suivi, note choisie dans une
 * liste) : la note quittée, et `position`, passent dans « avant » ; « après » se vide.
 */
export function noteVisited(tab: Tab, note: string, position: NotePosition | null): Tab {
  const here: Visit = { note: tab.note, position };
  return { ...tab, note, title: null, trail: { back: [...trailOf(tab).back, here], forward: [] } };
}

/**
 * L'onglet fait un pas dans son parcours : il montre la note d'avant (ou d'après), et la note
 * quittée, avec `position`, passe de l'autre côté. Sans note de ce côté, rien ne change.
 */
export function trailWalked(tab: Tab, step: TrailStep, position: NotePosition | null): Tab {
  const target = trailTarget(tab, step);
  if (target === null) return tab;
  const { back, forward } = trailOf(tab);
  const here: Visit = { note: tab.note, position };
  const trail =
    step === -1
      ? { back: back.slice(0, -1), forward: [...forward, here] }
      : { back: [...back, here], forward: forward.slice(0, -1) };
  return { ...tab, note: target.note, title: null, trail };
}

/** Les notes du parcours ont changé de chemin (renommage, déplacement) : il les suit. */
export function trailMoved(tab: Tab, moved: (path: string) => string): Tab {
  if (tab.trail === undefined) return tab;
  const follow = (visits: readonly Visit[]) =>
    visits.map((visit) => ({ ...visit, note: moved(visit.note) }));
  return { ...tab, trail: { back: follow(tab.trail.back), forward: follow(tab.trail.forward) } };
}

/** Des notes ont quitté l'espace de travail (corbeille) : le parcours les oublie. */
export function trailForgotten(tab: Tab, removed: (path: string) => boolean): Tab {
  if (tab.trail === undefined) return tab;
  const kept = (visits: readonly Visit[]) => visits.filter((visit) => !removed(visit.note));
  return { ...tab, trail: { back: kept(tab.trail.back), forward: kept(tab.trail.forward) } };
}
