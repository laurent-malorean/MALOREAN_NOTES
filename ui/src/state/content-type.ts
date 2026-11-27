import type { ContentTypeItem } from "../bridge";

/** Le nom montré de chaque type de contenu (fiches 0034, 0037, 0041, 0050, 0052, 0058 et 0104). */
const LABELS: Record<ContentTypeItem, string> = {
  note: "Note",
  researchNotebook: "Cahier de recherche",
  mindMap: "Carte mentale",
  canvas: "Canvas",
  entry: "Entrée",
  node: "Nœud",
  crm: "CRM",
  crmCompany: "Entreprise",
  crmPerson: "Personne",
  crmAction: "Action",
  crmProject: "Projet",
  agenda12: "Agenda 12",
  agenda12Event: "Événement",
};

/** Ce qui sépare le type de contenu du titre de son conteneur : « Entrée · Levures ». */
const CONTAINER_SEPARATOR = " · ";

/** Le nom montré d'un type de contenu, sur chaque résultat de recherche. */
export function contentTypeLabel(contentType: ContentTypeItem): string {
  return LABELS[contentType];
}

/** Le type de contenu d'un élément trouvé, suivi du titre de son conteneur s'il en a un. */
export function placeLabel(contentType: ContentTypeItem, containerTitle: string | null): string {
  const label = contentTypeLabel(contentType);
  return containerTitle === null ? label : `${label}${CONTAINER_SEPARATOR}${containerTitle}`;
}
