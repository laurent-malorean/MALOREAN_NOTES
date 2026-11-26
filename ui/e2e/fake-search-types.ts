// Le type de contenu que le faux Rust donne à un résultat de recherche, comme l'index : le canvas par son
// extension, une fiche de CRM par le type de son en-tête, le reste par `fakeContentType`.
import type { ContentTypeItem } from "../src/bridge";
import { fakeContentType } from "./fake-mind-map";

const FICHE_TYPES: Record<string, ContentTypeItem> = {
  "crm-action": "crmAction",
  "crm-projet": "crmProject",
  "crm-personne": "crmPerson",
  "crm-entreprise": "crmCompany",
};

/** Le type de contenu du résultat de recherche d'une note ou d'un fichier. */
export function searchContentType(path: string, content: string): ContentTypeItem {
  if (path.endsWith(".canvas")) return "canvas";
  const declared = /^---\n(?:.*\n)*?type: (crm-[a-z]+)\n(?:.*\n)*?---\n/.exec(content)?.[1];
  return (declared === undefined ? undefined : FICHE_TYPES[declared]) ?? fakeContentType(content);
}

/** Le titre du résultat : le nom du fichier pour un canvas, le titre de la note sinon. */
export const searchTitle = (path: string, noteTitle: string | null): string =>
  path.endsWith(".canvas")
    ? path.replace(/^.*\//, "").replace(/\.canvas$/, "")
    : (noteTitle ?? "Sans titre");
