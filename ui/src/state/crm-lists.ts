// Les listes du CRM à l'écran (fiche 0063, spécification §§ 7.3 à 7.6) : ce qui se lit et se formate
// sans écran. Les compteurs, l'ordre des fiches et les actions de chaque fiche viennent de Rust.
import type { CrmActionItem, CrmItem, CrmPersonItem } from "../bridge";

type TallyItem = CrmPersonItem["tally"];
import { shortDay } from "./crm-days";
import type { Lookups } from "./crm-card";

/** Le nom de l'entreprise des personnes qui n'en ont pas. */
export const NODATA = "NODATA";

/** Un texte sans majuscules ni accents : la recherche d'une liste ne les compte pas. */
export const fold = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Le nom `title` répond à la recherche `query` (vide : tout répond). */
export const matchesName = (title: string, query: string): boolean =>
  fold(title).includes(fold(query.trim()));

/** « 1 personne », « 2 personnes » : le pluriel dès 2. */
export const countText = (count: number, word: string): string =>
  `${String(count)} ${word}${count > 1 ? "s" : ""}`;

/** Ce que disent, même repliés, une entreprise, une personne ou un projet : le retard (rouge) et le jour (orange). */
export function tallyBadges(tally: TallyItem): { late: string | null; today: string | null } {
  return {
    late: tally.late > 0 ? `${String(tally.late)} en retard` : null,
    today: tally.today > 0 ? `${String(tally.today)} à faire aujourd'hui` : null,
  };
}

/** Ce qui est déplié dans les listes, lu dans ce que l'ordinateur a gardé : une liste de textes, sinon rien. */
export function parseUnfolded(raw: string | null): Set<string> {
  try {
    const keys: unknown = JSON.parse(raw ?? "[]");
    const valid = Array.isArray(keys) && keys.every((key) => typeof key === "string");
    return new Set(valid ? (keys as string[]) : []);
  } catch {
    return new Set();
  }
}

export const serializeUnfolded = (keys: ReadonlySet<string>): string => JSON.stringify([...keys]);

/** Les couleurs que portent les autres projets : grisées dans le choix, mais choisissables (§ 7.5). */
export function takenColors(projects: CrmItem["projects"], except: string): Set<string> {
  return new Set(projects.filter((p) => p.name !== except).map((p) => p.color));
}

/** Ce qu'une liste dit d'une action avant son titre ; `null` : rien à dire. */
export interface ActionLine {
  readonly name: string;
  readonly date: string | null;
  readonly status: string;
  readonly people: string | null;
  readonly companies: string | null;
  readonly project: { readonly title: string; readonly color: string } | null;
  readonly title: string;
}

/**
 * `project` : l'onglet Projets dit les personnes et les entreprises, pas le projet (c'est le projet
 * déplié). `person` : les autres listes et les fiches disent le projet, pas les personnes.
 */
export type LineScope = "project" | "person";

const joined = (words: readonly string[]): string | null =>
  words.length === 0 ? null : words.join(", ");

/** Les personnes et les entreprises d'une action ; une fiche disparue est laissée de côté (§ 4.1). */
function whoOf(action: CrmActionItem, lookups: Lookups) {
  const people: string[] = [];
  const companies: string[] = [];
  for (const entry of action.people) {
    const name = lookups.people.get(entry.person);
    if (name === undefined) continue;
    people.push(name);
    const where = entry.company === null ? NODATA : lookups.companies.get(entry.company);
    if (where !== undefined && !companies.includes(where)) companies.push(where);
  }
  return { people: joined(people), companies: joined(companies) };
}

/** La ligne de l'action `action` : `date · statut · [personnes · entreprises] · [projet] · titre` (§ 7.6). */
export function actionLine(
  action: CrmActionItem,
  lookups: Lookups,
  today: string,
  scope: LineScope,
): ActionLine {
  const who = scope === "project" ? whoOf(action, lookups) : { people: null, companies: null };
  const project =
    scope === "person" && action.project !== null
      ? lookups.projects.get(action.project)
      : undefined;
  return {
    ...{ name: action.name, status: action.status, title: action.title, ...who },
    date: action.date === null ? null : shortDay(action.date, today),
    project: project ?? null,
  };
}
