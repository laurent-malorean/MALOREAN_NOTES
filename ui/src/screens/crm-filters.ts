// La rangée de recherche et de filtres (fiche 0060, spécification § 7.1) au-dessus du Kanban et de
// Ma semaine. Le champ de recherche est créé une fois : le redessiner à chaque frappe lui ferait
// perdre le curseur. Le reste est refait après chaque lecture.
import type { CompanyChoiceItem, CrmFiltersItem, CrmItem } from "../bridge";
import { tagColor } from "../state/crm-card";
import { actionButton, h } from "./crm-dom";

export const ALL_PEOPLE = "Toutes les personnes";
export const ALL_COMPANIES = "Toutes les entreprises";
export const ALL_PROJECTS = "Tous les projets";
/** Le nom montré de l'entreprise des personnes qui n'en ont pas. */
export const NODATA = "NODATA";

/** Ce que changent les filtres, dit par l'écran. */
export interface FilterActions {
  readonly search: (text: string) => void;
  readonly person: (reference: string | null) => void;
  readonly company: (choice: CompanyChoiceItem | null) => void;
  readonly project: (reference: string | null) => void;
  readonly tag: (tag: string) => void;
}

export interface FiltersBar {
  readonly element: HTMLElement;
  /** Redessine les listes et les boutons d'après le CRM et les filtres ; le champ de recherche reste. */
  update(crm: CrmItem, filters: CrmFiltersItem): void;
}

const NODATA_VALUE = "nodata";
const COMPANY_PREFIX = "company:";

/** Une liste d'options : le choix « tous » en tête (valeur vide), puis `choices`. */
function select(
  label: string,
  all: string,
  choices: readonly { value: string; text: string }[],
  chosen: string,
  change: (value: string) => void,
): HTMLSelectElement {
  const list = h("select", "crm-filter-select");
  list.setAttribute("aria-label", label);
  for (const { value, text } of [{ value: "", text: all }, ...choices]) {
    const option = h("option", "", text);
    option.value = value;
    list.append(option);
  }
  list.value = chosen;
  list.addEventListener("change", () => change(list.value));
  return list;
}

const byText = (a: { text: string }, b: { text: string }) => a.text.localeCompare(b.text, "fr");

function companyValue(choice: CompanyChoiceItem | null): string {
  if (choice === null) return "";
  return choice.kind === "noData" ? NODATA_VALUE : COMPANY_PREFIX + choice.name;
}

function companyChoice(value: string): CompanyChoiceItem | null {
  if (value === "") return null;
  if (value === NODATA_VALUE) return { kind: "noData" };
  return { kind: "company", name: value.slice(COMPANY_PREFIX.length) };
}

/** Un bouton arrondi à une couleur de la palette, actif ou non. */
function pill(text: string, color: string | null, active: boolean, click: () => void) {
  const button = actionButton("crm-pill", text);
  button.setAttribute("aria-pressed", String(active));
  if (color !== null) button.style.setProperty("--label-color", `var(--palette-${color})`);
  button.addEventListener("click", click);
  return button;
}

/** « Tous les projets » (actif d'office) et un bouton par projet ; rien sans projet. */
function projectRow(crm: CrmItem, filters: CrmFiltersItem, act: FilterActions): HTMLElement | null {
  if (crm.projects.length === 0) return null;
  const row = h("div", "crm-filter-row crm-filter-projects");
  row.append(pill(ALL_PROJECTS, null, filters.projects.length === 0, () => act.project(null)));
  for (const project of crm.projects)
    row.append(
      pill(project.title, project.color, filters.projects.includes(project.name), () =>
        act.project(project.name),
      ),
    );
  return row;
}

/** Un bouton par étiquette du CRM ; rien sans étiquette. */
function tagRow(crm: CrmItem, filters: CrmFiltersItem, act: FilterActions): HTMLElement | null {
  if (crm.tags.length === 0) return null;
  const row = h("div", "crm-filter-row crm-filter-tags");
  for (const tag of crm.tags)
    row.append(pill(tag, tagColor(tag), filters.tags.includes(tag), () => act.tag(tag)));
  return row;
}

export function createFiltersBar(act: FilterActions): FiltersBar {
  const element = h("div", "crm-filters");
  const search = h("input", "crm-search");
  search.type = "search";
  search.placeholder = "Rechercher une action";
  search.setAttribute("aria-label", "Rechercher une action");
  search.addEventListener("input", () => act.search(search.value));
  const rest = h("div", "crm-filters-rest");
  element.append(search, rest);
  return {
    element,
    update(crm, filters) {
      search.value = filters.search;
      const people = crm.people.map((p) => ({ value: p.name, text: p.title })).sort(byText);
      const companies = crm.companies.map((c) => ({
        value: COMPANY_PREFIX + c.name,
        text: c.title,
      }));
      rest.replaceChildren(
        select("Filtrer par personne", ALL_PEOPLE, people, filters.person ?? "", (v) =>
          act.person(v === "" ? null : v),
        ),
        select(
          "Filtrer par entreprise",
          ALL_COMPANIES,
          [{ value: NODATA_VALUE, text: NODATA }, ...companies.sort(byText)],
          companyValue(filters.company),
          (v) => act.company(companyChoice(v)),
        ),
        ...[projectRow(crm, filters, act), tagRow(crm, filters, act)].filter((row) => row !== null),
      );
    },
  };
}
