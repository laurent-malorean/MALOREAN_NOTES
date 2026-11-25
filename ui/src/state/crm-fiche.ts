// Les fiches d'entreprise et de personne (fiche 0063, spécification § 9) : ce que l'interface sait
// d'une fiche sans écran. Les listes et les compteurs viennent de Rust ; ici, seulement leur
// présentation (les 10 dernières actions, les anciennes personnes, le parcours).
import type { CrmActionItem, CrmCompanyItem, CrmItem, CrmPersonItem } from "../bridge";
import type { Lookups } from "./crm-card";
import { declaredType } from "./declared-type";

type PassageItem = CrmPersonItem["career"][number];

export type FicheKind = "company" | "person";

/** Combien d'actions récentes la fiche d'une entreprise montre pour chacune de ses personnes. */
export const LAST_ACTIONS = 10;

/** Le dossier de chaque sorte de fiche, et la valeur de `type:` qui la déclare. */
const FOLDERS: Record<FicheKind, string> = { company: "entreprises", person: "personnes" };
const TYPES: Record<string, FicheKind> = { "crm-entreprise": "company", "crm-personne": "person" };

/** Le chemin de la fiche `name` d'un CRM : `clients.md` + `jean` : `clients/personnes/jean.md`. */
export const crmFichePath = (crm: string, kind: FicheKind, name: string): string =>
  `${crm.replace(/\.md$/i, "")}/${FOLDERS[kind]}/${name}.md`;

/** Ce que dit une note de la fiche qu'elle est : sa sorte, son CRM et sa référence. */
export interface FicheTarget {
  readonly kind: FicheKind;
  readonly crm: string;
  readonly name: string;
}

/** La note est la fiche d'une entreprise ou d'une personne rangée dans le dossier de son CRM, sinon `null`. */
export function ficheTarget(path: string, content: string): FicheTarget | null {
  const kind = TYPES[declaredType(content) ?? ""];
  const parts = path.split("/");
  const folder = parts.at(-2);
  if (kind === undefined || parts.length < 3 || folder !== FOLDERS[kind]) return null;
  return {
    ...{ kind, crm: `${parts.slice(0, -2).join("/")}.md` },
    name: (parts.at(-1) as string).replace(/\.md$/i, ""),
  };
}

/** À date égale la dernière créée d'abord (son nom commence par la date de sa création) ; sans date, à la fin. */
function recentOrder(a: CrmActionItem, b: CrmActionItem): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return b.date.localeCompare(a.date);
  }
  return b.name.localeCompare(a.name);
}

/** Ces actions, la plus récente d'abord. */
export const recentFirst = (actions: readonly CrmActionItem[]): CrmActionItem[] =>
  [...actions].sort(recentOrder);

const found = (references: readonly string[], lookups: Lookups): CrmActionItem[] =>
  references.flatMap((reference) => {
    const action = lookups.actions.get(reference);
    return action === undefined ? [] : [action];
  });

/** Les dernières actions d'une personne, ouvertes et terminées mêlées, la plus récente d'abord. */
export function lastActions(
  person: CrmPersonItem,
  lookups: Lookups,
  limit = LAST_ACTIONS,
): CrmActionItem[] {
  const all = found([...person.openActions, ...person.closedActions], lookups);
  return recentFirst(all).slice(0, limit);
}

/** Toutes les actions d'une personne (§ 9.2) : les ouvertes, puis les terminées, chaque groupe de la plus récente à la plus ancienne. */
export function personActions(
  person: CrmPersonItem,
  lookups: Lookups,
): { open: CrmActionItem[]; closed: CrmActionItem[] } {
  return {
    open: recentFirst(found(person.openActions, lookups)),
    closed: recentFirst(found(person.closedActions, lookups)),
  };
}

/** Une personne passée par l'entreprise, et ce qu'elle y avait (les actions dont son entreprise d'alors est celle-ci). */
export interface FormerPerson {
  readonly person: CrmPersonItem;
  readonly actions: CrmActionItem[];
}

/** Les anciennes personnes de l'entreprise (§ 9.1) : passées par elle, et qui n'y sont plus. */
export function formerPeople(company: CrmCompanyItem, crm: CrmItem): FormerPerson[] {
  return crm.people
    .filter(
      (person) =>
        !company.people.includes(person.name) &&
        person.career.some((passage) => passage.company === company.name),
    )
    .map((person) => ({
      person,
      actions: recentFirst(
        crm.actions.filter((action) =>
          action.people.some((p) => p.person === person.name && p.company === company.name),
        ),
      ),
    }));
}

/** Le parcours, une ligne par passage : « Acme · 2026-03-01 → » ; un passage dans une entreprise disparue est laissé de côté. */
export function careerLines(career: readonly PassageItem[], lookups: Lookups): string[] {
  return career.flatMap((passage) => {
    const title = lookups.companies.get(passage.company);
    return title === undefined
      ? []
      : [`${title} · ${passage.from} → ${passage.to ?? ""}`.trimEnd()];
  });
}
