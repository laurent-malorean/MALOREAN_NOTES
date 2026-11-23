// L'éditeur de chaque colonne : branché sur les notes partagées, réglé comme les autres colonnes.
import type { Editor } from "../editor/editor";
import { imageAddress } from "../editor/image-address";
import type { ColumnParts } from "../screens/columns-view";
import {
  createPane,
  type NotebookActions,
  type Pane,
  type PaneBackend,
  type PaneEvents,
  type RelatedNotes,
} from "../screens/note-pane";
import type { SharedNotes } from "../screens/shared-notes";
import { folderOf } from "../state/folders";

export interface PanesDeps {
  readonly backend: PaneBackend & { readonly fileAddress: (path: string) => string };
  readonly shared: SharedNotes;
  readonly events: PaneEvents;
  /** Ce que fait une colonne d'un cahier de recherche : son « + », ses liens vers une entrée. */
  readonly notebook: NotebookActions;
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

/** Ce qui pose l'éditeur d'une colonne qui vient d'apparaître. */
export function paneMaker(deps: PanesDeps): (parts: ColumnParts) => Pane {
  return (parts) => {
    const pane = createPane(parts, {
      backend: deps.backend,
      shared: deps.shared,
      events: deps.events,
      notebook: deps.notebook,
      related: deps.related,
      resolveImage: (src, note) =>
        imageIn(deps.workspacePath(), note, src, deps.backend.fileAddress),
    });
    deps.configure(pane.editor);
    return pane;
  };
}
