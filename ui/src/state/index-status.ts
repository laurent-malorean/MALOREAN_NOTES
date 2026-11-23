// L'état de l'index de mots, tel que l'onglet « Index » des réglages le montre.
import type { IndexOverviewItem } from "../bridge/generated/IndexOverviewItem";

const number = new Intl.NumberFormat("fr-FR");

/** Les lignes de l'état : les notes indexées, et la dernière reconstruction depuis le lancement. */
export function indexStatusLines(overview: IndexOverviewItem): string[] {
  const notes = `${number.format(overview.notes)} ${overview.notes > 1 ? "notes indexées" : "note indexée"}`;
  return [notes, `Dernière reconstruction : ${overview.rebuilt ?? "aucune depuis le lancement"}`];
}
