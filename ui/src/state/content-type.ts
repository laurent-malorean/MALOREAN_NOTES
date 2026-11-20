import type { ContentTypeItem } from "../bridge";

/** Le nom montré de chaque type de contenu (fiches 0034, 0037 et 0041). */
const LABELS: Record<ContentTypeItem, string> = {
  note: "Note",
  researchNotebook: "Cahier de recherche",
  entry: "Entrée",
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
