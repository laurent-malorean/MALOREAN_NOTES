// Les résultats d'une recherche rangés en sections de résultats, une par famille de contenu (fiche 0093).
import type { ContentTypeItem, SearchResultItem } from "../bridge";

/** Une section : le titre de la famille et ses résultats, dans l'ordre de la colonne. */
export interface ResultSection {
  readonly title: string;
  readonly results: readonly SearchResultItem[];
}

/** Les sections, dans l'ordre où elles s'affichent : « Notes » en dernier, elles sont bien plus nombreuses. */
const SECTIONS: readonly { readonly title: string; readonly types: readonly ContentTypeItem[] }[] =
  [
    { title: "Canvas", types: ["canvas"] },
    { title: "Cartes mentales", types: ["mindMap", "node"] },
    { title: "Cahiers de recherche", types: ["researchNotebook", "entry"] },
    { title: "CRM", types: ["crm", "crmAction", "crmProject", "crmPerson", "crmCompany"] },
    { title: "Agendas 12", types: ["agenda12", "agenda12Event"] },
    { title: "Notes", types: ["note"] },
  ];

/** La section qui reçoit ce qu'aucune autre ne connaît. */
const FALLBACK = SECTIONS.length - 1;

function sectionOf(contentType: ContentTypeItem): number {
  const index = SECTIONS.findIndex((section) => section.types.includes(contentType));
  return index < 0 ? FALLBACK : index;
}

/** Range les résultats par section ; une section sans résultat est absente, l'ordre interne ne change pas. */
export function resultSections(results: readonly SearchResultItem[]): ResultSection[] {
  const grouped = SECTIONS.map((): SearchResultItem[] => []);
  for (const result of results) grouped[sectionOf(result.contentType)]?.push(result);
  return SECTIONS.flatMap((section, index) => {
    const found = grouped[index] ?? [];
    return found.length === 0 ? [] : [{ title: section.title, results: found }];
  });
}

/** Le titre montré d'une section, avec son nombre de résultats : « Canvas (1) ». */
export function sectionTitle(section: ResultSection): string {
  return `${section.title} (${section.results.length})`;
}
