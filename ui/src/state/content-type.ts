import type { ContentTypeItem } from "../bridge";

/** Le nom montré de chaque type de contenu (fiches 0034 et 0037) : un seul pour l'instant. */
const LABELS: Record<ContentTypeItem, string> = { note: "Note" };

/** Le nom montré d'un type de contenu, sur chaque résultat de recherche. */
export function contentTypeLabel(contentType: ContentTypeItem): string {
  return LABELS[contentType];
}
