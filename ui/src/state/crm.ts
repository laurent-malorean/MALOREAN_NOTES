// Le CRM à l'écran (fiche 0060) : ce que l'interface sait d'une note CRM sans écran. Les règles
// (colonnes, ordre, retard, semaine) sont calculées par Rust ; ici, seulement ce qui se lit et se
// formate pour l'affichage.
import type { CrmFiltersItem } from "../bridge";
import { declaredType } from "./declared-type";

/** La valeur de `type:` d'un CRM, comme Rust l'écrit. */
const CRM_TYPE = "crm";

/** La note est un CRM : son en-tête le déclare, comme Rust le lit (guillemets permis). */
export function isCrmContent(content: string): boolean {
  return declaredType(content) === CRM_TYPE;
}

/** Les onglets d'un CRM, dans l'ordre où on les voit (spécification § 7). */
export const TABS = [
  { id: "kanban", label: "Kanban" },
  { id: "week", label: "Ma semaine" },
  { id: "people", label: "Personnes" },
  { id: "companies", label: "Entreprises" },
  { id: "projects", label: "Projets" },
] as const;

export type CrmTab = (typeof TABS)[number]["id"];

/** L'onglet ouvert d'office. */
export const DEFAULT_TAB: CrmTab = "kanban";

/** L'onglet gardé sur ce Mac, ou le Kanban si ce qui est gardé n'en est pas un. */
export function storedTab(value: unknown): CrmTab {
  return TABS.find((tab) => tab.id === value)?.id ?? DEFAULT_TAB;
}

/** La rangée de recherche et de filtres, au repos : tout passe. */
export const NO_FILTERS: CrmFiltersItem = {
  search: "",
  person: null,
  company: null,
  projects: [],
  tags: [],
};

/** Un filtre est actif : une carte lâchée ne peut alors pas être placée (des cartes sont cachées). */
export function isFiltered(filters: CrmFiltersItem): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.person !== null ||
    filters.company !== null ||
    filters.projects.length > 0 ||
    filters.tags.length > 0
  );
}

/** La liste avec `item` en plus, ou en moins s'il y était déjà : cliquer des projets ou des étiquettes les cumule. */
export function toggled(list: readonly string[], item: string): string[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}
