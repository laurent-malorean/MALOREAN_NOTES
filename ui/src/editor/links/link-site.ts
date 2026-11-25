// Où le bouton « Lien » écrit : le texte sélectionné, et ce qu'on peut en faire.
import type { EditorView } from "@codemirror/view";
import type { LinkableItem } from "../../bridge";
import { writtenLink } from "../../state/link-choice";
import { writeWebLink } from "../writing/formatting";
import type { LinkMenuSupport } from "./link-menu";

/** Le passage de la note qui devient un lien. */
export interface LinkSite {
  /** Le texte sélectionné, qui devient le texte du lien ; vide sans sélection. */
  readonly text: string;
  /** Le passage devient un lien vers ce contenu : `[[lien|texte]]`. */
  insertContent(item: LinkableItem): void;
  /** Le passage devient un lien vers une page web : `[texte](url)`, l'adresse à taper sélectionnée. */
  insertWeb(): void;
}

/** Ce que l'éditeur demande à l'application pour les liens : la liste, et le choix du bouton « Lien ». */
export interface EditorLinks extends LinkMenuSupport {
  /** Le bouton « Lien » : demande ce qu'on lie, puis écrit sur `site` ; sans lui, « Lien » pose un lien vers une page web. */
  readonly choose?: (site: LinkSite) => void;
}

/** Le passage sélectionné de `view` : il garde ses bornes, même si la fenêtre de choix prend le focus. */
export function linkSiteOf(view: EditorView): LinkSite {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  const within = (pos: number) => Math.min(pos, view.state.doc.length);
  return {
    text,
    insertContent(item) {
      const insert = writtenLink(item, text);
      view.dispatch({
        changes: { from: within(from), to: within(to), insert },
        selection: { anchor: within(from) + insert.length },
        scrollIntoView: true,
      });
      view.focus();
    },
    insertWeb() {
      view.dispatch({ selection: { anchor: within(from), head: within(to) } });
      writeWebLink(view);
      view.focus();
    },
  };
}
