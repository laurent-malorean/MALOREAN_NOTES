// Le bouton « Lien » de la barre de mise en forme (et Cmd+K, la palette, le menu Format) : on
// choisit ce qu'on lie, « Une note ou un contenu » ou « Une page web ». Le texte sélectionné
// devient le lien.
import type { LinkSite } from "../editor/links/link-site";
import { openPicker } from "../screens/picker";
import { LINK_KINDS } from "../state/link-choice";
import { matching } from "../state/quick-open";
import { chooseLinkable, type LinkPickerBackend } from "./link-picker";

export interface LinkChooserDeps {
  readonly backend: LinkPickerBackend;
  /** La fenêtre de choix. */
  readonly picker: HTMLDialogElement;
  readonly error: (error: unknown) => void;
}

/** Ouvre le choix du type de lien, puis, pour un contenu, la recherche de contenus à lier. */
export function linkChooser(deps: LinkChooserDeps): (site: LinkSite) => void {
  return (site) =>
    openPicker(deps.picker, {
      label: "Insérer un lien",
      placeholder: "Ce qu'on lie",
      empty: "Aucun type de lien ne correspond",
      entries: (query) => matching(LINK_KINDS, query, ({ label }) => label),
      describe: ({ label }) => ({ label }),
      choose: ({ kind }) => {
        if (kind === "web") return site.insertWeb();
        chooseLinkable(deps.backend, deps.picker)
          .then((item) => item && site.insertContent(item))
          .catch(deps.error);
      },
    });
}
