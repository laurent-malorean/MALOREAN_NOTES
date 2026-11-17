// Une colonne à l'écran : son éditeur, la note qu'il montre, partagée avec les autres colonnes.
import type { AttachmentOrigin } from "../bridge";
import type { AttachedFile } from "../bridge/generated/AttachedFile";
import type { LinkingNoteItem } from "../bridge/generated/LinkingNoteItem";
import { createEditor, type Editor } from "../editor/editor";
import { renderBacklinks } from "./backlinks-view";
import type { ColumnParts } from "./columns-view";
import type { SharedNotes, Viewer } from "./shared-notes";

/** Ce qu'une colonne demande à Rust, par le pont. */
export interface PaneBackend {
  readonly listBacklinks: (path: string) => Promise<LinkingNoteItem[]>;
  readonly attachFile: (
    path: string,
    file: File,
    origin: AttachmentOrigin,
  ) => Promise<AttachedFile>;
  readonly openAttachment: (path: string, target: string) => Promise<unknown>;
}

/** Ce qu'une colonne annonce à l'application. */
export interface PaneEvents {
  /** Ouvrir une note des liens entrants. */
  readonly openNote: (path: string) => void;
  /** Ouvrir la note visée par un lien `[[titre]]`. */
  readonly openLink: (title: string) => void;
  readonly error: (error: unknown) => void;
}

export interface PaneOptions {
  readonly backend: PaneBackend;
  readonly events: PaneEvents;
  /** Les notes montrées par toutes les colonnes : lecture, frappe partagée, enregistrement. */
  readonly shared: SharedNotes;
  /** L'adresse chargeable d'une image écrite dans la note `note`. */
  readonly resolveImage: (src: string, note: string | null) => string;
}

export interface Pane {
  readonly editor: Editor;
  /** La note montrée, sous son chemin le plus récent ; `null` si aucune. */
  note(): string | null;
  /**
   * Montre une autre note : ce qui était tapé est enregistré si plus aucune colonne ne la montre,
   * puis elle est lue, ou prise d'une autre colonne qui la montre. Rien si c'est déjà elle.
   */
  load(path: string | null): Promise<void>;
  /** Enregistre tout de suite ce qui est tapé. */
  flush(): Promise<void>;
  /** La note a quitté la bibliothèque : ce qu'on tape n'est plus enregistré. */
  forget(): void;
  /** Montre les liens entrants de la note ; une réponse arrivée pour une autre note est ignorée. */
  showBacklinks(): Promise<void>;
  /** La note a changé sur le disque : voir la fiche de décision 0014. */
  followDisk(): Promise<void>;
  /** Retire la colonne de l'écran, ce qui est tapé étant enregistré. */
  destroy(): void;
}

/** Une colonne : son éditeur et la note qu'il montre ; le texte et l'enregistrement sont partagés. */
class NotePane implements Pane, Viewer {
  readonly editor: Editor;
  private shown: string | null = null;

  constructor(
    private readonly parts: ColumnParts,
    private readonly options: PaneOptions,
  ) {
    const { backend, events, shared } = options;
    this.editor = createEditor(
      parts.element,
      (content, changes) => shared.typed(this, changes, content),
      {
        // Une image relative est cherchée à côté de la note, dans son dossier.
        resolveImage: (src) => options.resolveImage(src, this.shown),
        attachmentActions: {
          attach: (file, origin) => this.attach(file, origin),
          open: (target) => {
            if (this.shown !== null)
              void backend.openAttachment(this.shown, target).catch(events.error);
          },
        },
        openLink: events.openLink,
      },
    );
  }

  note(): string | null {
    return this.shown;
  }

  async load(path: string | null): Promise<void> {
    if (this.shown === path) return;
    this.shown = path;
    await this.options.shared.leave(this);
    void this.showBacklinks().catch(this.options.events.error);
    if (path === null) return this.editor.show("");
    await this.options.shared.join(path, this);
  }

  async flush(): Promise<void> {
    await this.options.shared.flush(this);
  }

  forget(): void {
    this.options.shared.forget(this);
  }

  async showBacklinks(): Promise<void> {
    const path = this.shown;
    const notes = path === null ? [] : await this.options.backend.listBacklinks(path);
    if (this.shown === path)
      renderBacklinks(this.parts.backlinks, notes, this.options.events.openNote);
  }

  async followDisk(): Promise<void> {
    await this.options.shared.followDisk(this);
  }

  /** La note vient d'être enregistrée sous ce chemin ; son titre, donc ses liens entrants, ont pu changer. */
  saved(path: string): void {
    this.shown = path;
    void this.showBacklinks().catch(this.options.events.error);
  }

  destroy(): void {
    void this.options.shared.leave(this).catch(this.options.events.error);
    this.editor.destroy();
  }

  /** Joint un fichier : ce qui est tapé est enregistré d'abord, pour viser le vrai nom de la note. */
  private async attach(file: File, origin: AttachmentOrigin): Promise<string | null> {
    try {
      await this.flush();
      if (this.shown === null) return null;
      return (await this.options.backend.attachFile(this.shown, file, origin)).markdown;
    } catch (error) {
      this.options.events.error(error);
      return null;
    }
  }
}

/** L'éditeur d'une colonne, posé dans son élément. */
export function createPane(parts: ColumnParts, options: PaneOptions): Pane {
  return new NotePane(parts, options);
}
