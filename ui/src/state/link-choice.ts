// Choisir un lien sans le saisir : la liste de tout ce qu'un lien peut désigner, filtrée par ce qui
// est tapé, et le lien à écrire pour chaque choix. Une seule liste pour la fenêtre de recherche de
// notes (action du CRM, bouton « Lien ») et pour le menu sous le curseur (`[[`, `/`).
import type { ContentTypeItem, LinkableItem } from "../bridge";
import type { NewContentIcon } from "./new-content-menu";
import { MAX_QUICK_OPEN_RESULTS, matching } from "./quick-open";

/** Le dessin de chaque type de contenu liable, le même que celui du menu de création. */
const ICONS: Readonly<Record<ContentTypeItem, NewContentIcon>> = {
  note: "note",
  researchNotebook: "notebook",
  mindMap: "mind-map",
  canvas: "canvas",
  entry: "note",
  node: "note",
  crm: "crm",
  crmCompany: "crm",
  crmPerson: "crm",
  crmAction: "crm",
  crmProject: "crm",
};

/** L'icône d'un contenu liable, selon son type. */
export const linkIcon = (item: LinkableItem): NewContentIcon => ICONS[item.contentType];

/**
 * Les contenus dont le titre, le lien ou le dossier contient chaque mot de `query` (majuscules et
 * accents ignorés), dans l'ordre reçu, ceux dont le titre commence par ce qui est tapé d'abord ;
 * les plus récents si rien n'est tapé. `MAX_QUICK_OPEN_RESULTS` au plus.
 */
export function matchingLinkable(items: readonly LinkableItem[], query: string): LinkableItem[] {
  return matching(items, query, (item) => `${item.title} ${item.link} ${item.folder}`).slice(
    0,
    MAX_QUICK_OPEN_RESULTS,
  );
}

/**
 * Le texte à écrire pour lier `item` : `[[lien]]`, ou `[[lien|texte]]` quand un texte est déjà
 * écrit (la sélection qui devient le lien) et qu'il diffère du lien.
 */
export function writtenLink(item: LinkableItem, shown = ""): string {
  const text = shown.trim();
  return text === "" || text === item.link ? `[[${item.link}]]` : `[[${item.link}|${text}]]`;
}

/** Ce qu'un lien peut viser : un contenu de l'espace de travail, ou une page web. */
export type LinkKind = "content" | "web";

/** Les deux choix du bouton « Lien », dans l'ordre. */
export const LINK_KINDS: readonly { readonly kind: LinkKind; readonly label: string }[] = [
  { kind: "content", label: "Une note ou un contenu" },
  { kind: "web", label: "Une page web" },
];
