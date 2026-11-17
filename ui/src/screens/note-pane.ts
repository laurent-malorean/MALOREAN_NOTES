// Une colonne à l'écran : son éditeur, la note qu'il montre, l'enregistrement de ce qu'on y tape.
import type { AttachmentOrigin } from "../bridge";
import type { AttachedFile } from "../bridge/generated/AttachedFile";
import type { LinkingNoteItem } from "../bridge/generated/LinkingNoteItem";
import type { NoteContent } from "../bridge/generated/NoteContent";
import type { SaveResult } from "../bridge/generated/SaveResult";
import { createEditor, type Editor } from "../editor/editor";
import { type Autosave, createAutosave, type Scheduler, timerScheduler } from "../state/autosave";
import { reactionToChange } from "../state/external-change";
import { renderBacklinks } from "./backlinks-view";
import type { ColumnParts } from "./columns-view";

/** Ce qu'une colonne demande à Rust, par le pont. */
export interface PaneBackend {
  readonly readNote: (path: string) => Promise<NoteContent>;
  readonly saveNote: (path: string, content: string, fingerprint: string) => Promise<SaveResult>;
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
  /** Ce qui était tapé est enregistré : la note `from` porte désormais le chemin `result.path`. */
  readonly saved: (from: string, result: SaveResult) => void;
  /** La note `path` a été lue : voici son titre affiché. */
  readonly titled: (path: string, title: string) => void;
  /** Ouvrir une note des liens entrants. */
  readonly openNote: (path: string) => void;
  /** Ouvrir la note visée par un lien `[[titre]]`. */
  readonly openLink: (title: string) => void;
  /** La note a été supprimée hors de l'application. */
  readonly deleted: () => void;
  readonly error: (error: unknown) => void;
}

export interface PaneOptions {
  readonly backend: PaneBackend;
  readonly events: PaneEvents;
  /** L'adresse chargeable d'une image écrite dans la note `note`. */
  readonly resolveImage: (src: string, note: string | null) => string;
  readonly scheduler?: Scheduler;
}

export interface Pane {
  readonly editor: Editor;
  /** La note montrée, sous son chemin le plus récent ; `null` si aucune. */
  note(): string | null;
  /** Montre une autre note : ce qui était tapé est enregistré, puis elle est lue. Rien si c'est déjà elle. */
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

/** Une colonne : la note montrée et l'enregistrement en cours vivent avec son éditeur. */
class NotePane implements Pane {
  readonly editor: Editor;
  private shown: string | null = null;
  private autosave: Autosave | null = null;
  private readonly scheduler: Scheduler;

  constructor(
    private readonly parts: ColumnParts,
    private readonly options: PaneOptions,
  ) {
    this.scheduler = options.scheduler ?? timerScheduler();
    const { backend, events } = options;
    this.editor = createEditor(parts.element, (content) => this.autosave?.edit(content), {
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
    });
  }

  note(): string | null {
    return this.shown;
  }

  async load(path: string | null): Promise<void> {
    if (this.shown === path) return;
    const previous = this.autosave;
    this.shown = path;
    this.autosave = null;
    await previous?.flush();
    void this.showBacklinks().catch(this.options.events.error);
    if (path === null) return this.editor.show("");
    const read = await this.options.backend.readNote(path);
    // Une autre note a pu être demandée pendant la lecture.
    if (this.shown !== path) return;
    this.autosave = this.edit(read);
    this.editor.show(read.content);
    this.options.events.titled(read.path, read.title);
  }

  async flush(): Promise<void> {
    await this.autosave?.flush();
  }

  forget(): void {
    this.autosave = null;
  }

  async showBacklinks(): Promise<void> {
    const path = this.shown;
    const notes = path === null ? [] : await this.options.backend.listBacklinks(path);
    if (this.shown === path)
      renderBacklinks(this.parts.backlinks, notes, this.options.events.openNote);
  }

  async followDisk(): Promise<void> {
    const editing = this.autosave;
    // Stryker disable next-line ConditionalExpression,LogicalOperator: une note qu'on enregistre est toujours montrée ; TypeScript exige le second cas.
    if (editing === null || this.shown === null) return;
    const disk = await this.options.backend.readNote(this.shown).catch(() => null);
    const reaction = reactionToChange(disk, editing.fingerprint(), editing.isIdle());
    if (reaction.kind === "reload") {
      editing.adopt(reaction.fingerprint);
      this.editor.reload(reaction.content);
      this.options.events.titled(this.shown, reaction.title);
    } else if (reaction.kind === "conflict") await editing.flush();
    else if (reaction.kind === "deleted") this.options.events.deleted();
  }

  destroy(): void {
    void this.autosave?.flush().catch(this.options.events.error);
    this.editor.destroy();
  }

  /** Joint un fichier : ce qui est tapé est enregistré d'abord, pour viser le vrai nom de la note. */
  private async attach(file: File, origin: AttachmentOrigin): Promise<string | null> {
    try {
      await this.autosave?.flush();
      if (this.shown === null) return null;
      return (await this.options.backend.attachFile(this.shown, file, origin)).markdown;
    } catch (error) {
      this.options.events.error(error);
      return null;
    }
  }

  /** L'enregistrement de la note lue ; il suit le nom que lui donne chaque enregistrement. */
  private edit(read: NoteContent): Autosave {
    let current = read.path;
    return createAutosave({
      path: current,
      fingerprint: read.fingerprint,
      scheduler: this.scheduler,
      save: this.options.backend.saveNote,
      onSaved: (result) => {
        const from = current;
        current = result.path;
        if (this.shown === from) this.shown = result.path;
        this.options.events.saved(from, result);
        // Le titre a pu changer : les liens entrants aussi.
        void this.showBacklinks().catch(this.options.events.error);
      },
      onError: this.options.events.error,
    });
  }
}

/** L'éditeur d'une colonne, posé dans son élément. */
export function createPane(parts: ColumnParts, options: PaneOptions): Pane {
  return new NotePane(parts, options);
}
