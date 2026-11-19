import type { ContentTypeItem } from "../bridge";

/** Le nom montré de chaque type de contenu (fiche 0034) : un seul pour l'instant. */
const LABELS: Record<ContentTypeItem, string> = { page: "Page" };

/** Le nom montré d'un type de contenu, sur chaque résultat de recherche. */
export function contentTypeLabel(contentType: ContentTypeItem): string {
  return LABELS[contentType];
}
