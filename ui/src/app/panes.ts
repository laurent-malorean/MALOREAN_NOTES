// L'éditeur de chaque colonne : branché sur les notes partagées, réglé comme les autres colonnes.
import type { Editor } from "../editor/editor";
import { type CanvasHostBackend, createCanvasHost, hasCanvasBackend } from "./canvas-host";
import { type CrmHostBackend, createCrmHost, hasCrmBackend } from "./crm-host";
import { linkChooser } from "./link-chooser";
import type { LinkPickerBackend } from "./link-picker";
import { imageAddress } from "../editor/image-address";
import { linkEntry } from "../screens/link-entry";
import type { ColumnParts } from "../screens/columns-view";
import {
  createPane,
  type NotebookActions,
  type Pane,
  type PaneBackend,
  type PaneEvents,
  type RelatedNotes,
} from "../screens/note-pane";
import type { Layout } from "../screens/layout";
import type { SharedNotes } from "../screens/shared-notes";
import { folderOf } from "../state/folders";

export interface PanesDeps {
  readonly backend: PaneBackend &
    Partial<CanvasHostBackend> &
    Partial<CrmHostBackend> &
    Partial<LinkPickerBackend> & { readonly fileAddress: (path: string) => string };
  readonly shared: SharedNotes;
  readonly events: PaneEvents;
  /** Ce que fait une colonne d'un cahier de recherche : son « + », ses liens vers une entrée. */
  readonly notebook: NotebookActions;
  /** Les fenêtres de l'écran, dont se sert le canvas d'une colonne pour choisir et demander (fiche 0052). */
  readonly layout?: Pick<Layout, "picker" | "confirmation">;
  /** Les notes proches de chaque colonne : demandées ou non, et lues par Rust. */
  readonly related?: RelatedNotes;
  /** Le dossier de l'espace de travail ouvert. */
  workspacePath(): string;
  /** Règle l'éditeur d'une nouvelle colonne comme ceux des autres : mode focus, caractères par page. */
  configure(editor: Editor): void;
}

/** L'adresse d'une image écrite dans la note `note` : une image relative est cherchée dans son dossier. */
export function imageIn(
  workspacePath: string,
  note: string | null,
  src: string,
  fileAddress: (path: string) => string,
): string {
  const folder = note === null ? "" : folderOf(note);
  return imageAddress(src, folder ? `${workspacePath}/${folder}` : workspacePath, fileAddress);
}

/** Ce que le canvas d'une colonne demande à l'application ; rien si les fenêtres ou le pont manquent. */
function canvasOf(deps: PanesDeps) {
  const { backend, layout } = deps;
  if (layout === undefined || !hasCanvasBackend(backend)) return {};
  return {
    canvas: createCanvasHost({ backend, picker: layout.picker, dialog: layout.confirmation }),
  };
}

/** Ce que le CRM d'une colonne demande à l'application ; rien si les fenêtres ou le pont manquent. */
function crmOf(deps: PanesDeps) {
  const { backend, layout } = deps;
  if (layout === undefined || !hasCrmBackend(backend)) return {};
  return { crm: createCrmHost({ backend, dialog: layout.confirmation, picker: layout.picker }) };
}

/** Ce que le menu des liens d'une colonne demande à Rust ; rien si le pont ne sait pas lister ce qu'on peut lier. */
function linksOf({ backend, layout, events }: PanesDeps) {
  const { listLinkable } = backend;
  if (listLinkable === undefined) return {};
  const row = linkEntry;
  const choose =
    layout &&
    linkChooser({ backend: { listLinkable }, picker: layout.picker, error: events.error });
  return { links: { contents: listLinkable, row, choose } };
}

/** Ce qui pose l'éditeur d'une colonne qui vient d'apparaître. */
export function paneMaker(deps: PanesDeps): (parts: ColumnParts) => Pane {
  return (parts) => {
    const pane = createPane(parts, {
      backend: deps.backend,
      shared: deps.shared,
      events: deps.events,
      notebook: deps.notebook,
      related: deps.related,
      ...canvasOf(deps),
      ...crmOf(deps),
      ...linksOf(deps),
      resolveImage: (src, note) =>
        imageIn(deps.workspacePath(), note, src, deps.backend.fileAddress),
    });
    deps.configure(pane.editor);
    return pane;
  };
}
