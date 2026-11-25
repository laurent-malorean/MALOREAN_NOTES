// Une carte du Kanban (fiche 0060, spécification § 7.1) : ce que l'écran en montre, de haut en bas.
// Rust a déjà calculé le retard, le jour et l'ordre ; ici, seulement le texte et les couleurs.
import type { CrmActionItem, CrmItem } from "../bridge";
import { shortDay } from "./crm-days";
import { PALETTE } from "./palette";

/** Combien de personnes une carte nomme avant de dire « +N ». */
export const PEOPLE_SHOWN = 2;

/** Ce qui est écrit à la place de la date d'une action ouverte datée d'aujourd'hui. */
export const TODAY_BADGE = "À faire aujourd'hui";

/** Un mot de couleur de la palette, par son nom. */
export type ColorName = (typeof PALETTE)[number];

/** Ce que dit le haut d'une carte : sa date, ou la pastille de retard ou du jour à la place. */
export type When =
  | { readonly kind: "date"; readonly text: string }
  | { readonly kind: "late"; readonly text: string }
  | { readonly kind: "today"; readonly text: string };

export interface CardView {
  readonly name: string;
  readonly title: string;
  readonly when: When | null;
  readonly project: { readonly title: string; readonly color: string } | null;
  /** Les deux premières personnes, « Nom (entreprise) ». */
  readonly people: readonly string[];
  /** Les personnes au-delà des deux premières. */
  readonly morePeople: number;
  readonly tags: readonly { readonly name: string; readonly color: ColorName }[];
  readonly hasDescription: boolean;
  /** « 1/2 » : éléments cochés sur le total de ses listes à cocher ; rien sans élément. */
  readonly checklist: string | null;
  readonly comments: number;
  readonly linkedNotes: number;
  /** Sa couleur d'action, ou, sans elle, `late` ou `today` pour le fond de sa pastille. */
  readonly color: string | null;
  readonly tone: "late" | "today" | null;
}

/** La couleur d'une étiquette, d'après son nom : la somme des codes de son nom en minuscules, modulo 10. */
export function tagColor(tag: string): ColorName {
  let sum = 0;
  for (const letter of tag.toLowerCase()) sum += letter.codePointAt(0) as number;
  return PALETTE[sum % PALETTE.length] as ColorName;
}

/** « En retard de 3 jours », « En retard de 1 jour » le lendemain. */
export const lateText = (days: number): string =>
  `En retard de ${days} ${days === 1 ? "jour" : "jours"}`;

function whenOf(action: CrmActionItem, today: string): When | null {
  if (action.urgency?.kind === "late") return { kind: "late", text: lateText(action.urgency.days) };
  if (action.urgency?.kind === "today") return { kind: "today", text: TODAY_BADGE };
  return action.date === null ? null : { kind: "date", text: shortDay(action.date, today) };
}

/** Les fiches du CRM, par leur référence : ce qu'il faut pour écrire une carte. */
export interface Lookups {
  readonly people: ReadonlyMap<string, string>;
  readonly companies: ReadonlyMap<string, string>;
  readonly projects: ReadonlyMap<string, { readonly title: string; readonly color: string }>;
  readonly actions: ReadonlyMap<string, CrmActionItem>;
}

export function lookupsOf(crm: CrmItem): Lookups {
  return {
    people: new Map(crm.people.map((p) => [p.name, p.title])),
    companies: new Map(crm.companies.map((c) => [c.name, c.title])),
    projects: new Map(crm.projects.map((p) => [p.name, { title: p.title, color: p.color }])),
    actions: new Map(crm.actions.map((a) => [a.name, a])),
  };
}

/** « Nom (entreprise) » ; les personnes ou entreprises disparues sont laissées de côté (§ 4.1). */
function peopleLines(action: CrmActionItem, lookups: Lookups): string[] {
  return action.people.flatMap(({ person, company }) => {
    const name = lookups.people.get(person);
    if (name === undefined) return [];
    const where = company === null ? undefined : lookups.companies.get(company);
    return [where === undefined ? name : `${name} (${where})`];
  });
}

function checklistOf(action: CrmActionItem): string | null {
  const total = action.checklists.reduce((sum, list) => sum + list.items.length, 0);
  const done = action.checklists.reduce((sum, list) => sum + list.done, 0);
  return total === 0 ? null : `${done}/${total}`;
}

/** Ce que la carte de l'action `action` montre. */
export function cardView(action: CrmActionItem, lookups: Lookups, today: string): CardView {
  const people = peopleLines(action, lookups);
  const project = action.project === null ? undefined : lookups.projects.get(action.project);
  const color =
    action.color !== null && PALETTE.some((c) => c === action.color) ? action.color : null;
  const urgent = action.urgency?.kind ?? null;
  return {
    ...{ name: action.name, title: action.title, when: whenOf(action, today) },
    project: project ?? null,
    people: people.slice(0, PEOPLE_SHOWN),
    morePeople: Math.max(0, people.length - PEOPLE_SHOWN),
    tags: action.tags.map((name) => ({ name, color: tagColor(name) })),
    hasDescription: action.description.trim() !== "",
    checklist: checklistOf(action),
    comments: action.comments.length,
    linkedNotes: action.linkedNotes.length,
    color,
    tone: color === null ? urgent : null,
  };
}
