// L'état de l'index de mots, tel que l'onglet « Index » des réglages le montre.
import type { IndexOverviewItem } from "../bridge/generated/IndexOverviewItem";
import { percent } from "./meaning";

const number = new Intl.NumberFormat("fr-FR");

/** Les lignes de l'état : les notes indexées, et la dernière reconstruction depuis le lancement. */
export function indexStatusLines(overview: IndexOverviewItem): string[] {
  const notes = `${number.format(overview.notes)} ${overview.notes > 1 ? "notes indexées" : "note indexée"}`;
  return [notes, `Dernière reconstruction : ${overview.rebuilt ?? "aucune depuis le lancement"}`];
}

/** Ce que la barre de l'index des notes montre : son pourcentage, et ce qu'elle écrit à côté. */
export interface IndexBarView {
  readonly percent: number;
  readonly written: string;
}

/** La barre de l'index des notes ; rien tant que le total de notes à indexer n'est pas connu (0). */
export function indexBarView(overview: IndexOverviewItem): IndexBarView | null {
  const { notes, total } = overview;
  if (total <= 0) return null;
  const done = percent(notes, total);
  return {
    percent: done,
    written: `${number.format(notes)} sur ${number.format(total)}, ${done} %`,
  };
}
