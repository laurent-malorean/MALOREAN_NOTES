// La même note montrée dans plusieurs colonnes : un seul texte, un seul enregistrement automatique.
import type { ChangeSet } from "@codemirror/state";
import type { NoteContent } from "../bridge/generated/NoteContent";
import type { SaveResult } from "../bridge/generated/SaveResult";
import type { Editor } from "../editor/editor";
import { type Autosave, createAutosave, type Scheduler, timerScheduler } from "../state/autosave";
import { reactionToChange } from "../state/external-change";

/** Ce que les notes partagées demandent à Rust, par le pont. */
export interface SharedNotesBackend {
  readonly readNote: (path: string) => Promise<NoteContent>;
  readonly saveNote: (path: string, content: string, fingerprint: string) => Promise<SaveResult>;
}

/** Ce que les notes partagées annoncent à l'application. */
export interface SharedNotesEvents {
  /** Ce qui était tapé est enregistré : la note `from` porte désormais le chemin `result.path`. */
  readonly saved: (from: string, result: SaveResult) => void;
  /** La note `path` a été lue : voici son titre affiché. */
  readonly titled: (path: string, title: string) => void;
  /** La note a été supprimée hors de l'application. */
  readonly deleted: () => void;
  readonly error: (error: unknown) => void;
}

export interface SharedNotesOptions {
  readonly backend: SharedNotesBackend;
  readonly events: SharedNotesEvents;
  readonly scheduler?: Scheduler;
}

/** Une colonne qui montre une note partagée. */
export interface Viewer {
  readonly editor: Editor;
  /** La note montrée vient d'être enregistrée, sous ce chemin (son titre a pu changer). */
  saved(path: string): void;
}

export interface SharedNotes {
  /**
   * La colonne montre la note `path` : le texte d'une autre colonne qui la montre déjà, sinon la
   * note lue sur le disque, une seule fois même si plusieurs colonnes la demandent ensemble.
   */
  join(path: string, viewer: Viewer): Promise<void>;
  /** La colonne ne montre plus sa note ; la dernière à la quitter enregistre ce qui est tapé. */
  leave(viewer: Viewer): Promise<void>;
  /** On a tapé dans la colonne : les autres colonnes de la note le montrent, et il sera enregistré. */
  typed(viewer: Viewer, changes: ChangeSet, content: string): void;
  /** Enregistre tout de suite ce qui est tapé dans la note de la colonne. */
  flush(viewer: Viewer): Promise<void>;
  /** La note de la colonne a quitté la bibliothèque : ce qu'on y tape n'est plus enregistré. */
  forget(viewer: Viewer): void;
  /** La note de la colonne a changé sur le disque : voir la fiche de décision 0014. */
  followDisk(viewer: Viewer): Promise<void>;
}

/** Une note montrée : ses colonnes (vrai une fois qu'elles la montrent), son enregistrement. */
interface Shared {
  path: string;
  title: string;
  readonly viewers: Map<Viewer, boolean>;
  autosave: Autosave | null;
  read: Promise<NoteContent>;
}

class SharedNoteList implements SharedNotes {
  /** Les notes montrées, par chemin. */
  private readonly notes = new Map<string, Shared>();
  /** La note de chaque colonne. */
  private readonly of = new Map<Viewer, Shared>();
  private readonly scheduler: Scheduler;

  constructor(private readonly options: SharedNotesOptions) {
    this.scheduler = options.scheduler ?? timerScheduler();
  }

  async join(path: string, viewer: Viewer): Promise<void> {
    const note = this.notes.get(path) ?? this.opened(path);
    note.viewers.set(viewer, false);
    this.of.set(viewer, note);
    const read = await note.read;
    // La colonne a pu demander une autre note pendant la lecture.
    if (this.of.get(viewer) !== note) return;
    const showing = [...note.viewers].find(([, shown]) => shown)?.[0];
    viewer.editor.show(showing ? showing.editor.content() : read.content);
    note.viewers.set(viewer, true);
    this.options.events.titled(note.path, note.title);
  }

  async leave(viewer: Viewer): Promise<void> {
    const note = this.of.get(viewer);
    if (note === undefined) return;
    this.of.delete(viewer);
    note.viewers.delete(viewer);
    if (note.viewers.size > 0) return;
    this.drop(note);
    await note.autosave?.flush();
  }

  typed(viewer: Viewer, changes: ChangeSet, content: string): void {
    const note = this.of.get(viewer);
    // Une colonne qui attend encore sa note tape dans la précédente : rien n'est gardé.
    if (note?.viewers.get(viewer) !== true) return;
    for (const other of note.viewers.keys())
      if (other !== viewer) other.editor.follow(changes, content);
    note.autosave?.edit(content);
  }

  async flush(viewer: Viewer): Promise<void> {
    await this.of.get(viewer)?.autosave?.flush();
  }

  forget(viewer: Viewer): void {
    const note = this.of.get(viewer);
    if (note) note.autosave = null;
  }

  async followDisk(viewer: Viewer): Promise<void> {
    const note = this.of.get(viewer);
    if (!note?.autosave) return;
    const editing = note.autosave;
    const disk = await this.options.backend.readNote(note.path).catch(() => null);
    const reaction = reactionToChange(disk, editing.fingerprint(), editing.isIdle());
    if (reaction.kind === "reload") {
      editing.adopt(reaction.fingerprint);
      note.title = reaction.title;
      for (const shown of note.viewers.keys()) shown.editor.reload(reaction.content);
      this.options.events.titled(note.path, reaction.title);
    } else if (reaction.kind === "conflict") await editing.flush();
    else if (reaction.kind === "deleted") this.options.events.deleted();
  }

  /** Une note qu'aucune colonne ne montrait : elle est lue, puis enregistrée à chaque frappe. */
  private opened(path: string): Shared {
    const note: Shared = {
      path,
      // Stryker disable next-line StringLiteral: le titre lu remplace celui-ci avant qu'une colonne ne montre la note.
      title: "",
      viewers: new Map(),
      autosave: null,
      read: this.options.backend.readNote(path),
    };
    this.notes.set(path, note);
    note.read.then(
      (read) => {
        note.title = read.title;
        note.autosave = this.edit(note, read);
      },
      // Une lecture ratée sera retentée par la prochaine colonne qui la demande.
      () => this.drop(note),
    );
    return note;
  }

  /** La note n'est plus montrée : une colonne qui la demande la relira. */
  private drop(note: Shared) {
    if (this.notes.get(note.path) === note) this.notes.delete(note.path);
  }

  /** L'enregistrement de la note ; il suit le nom que lui donne chaque enregistrement. */
  private edit(note: Shared, read: NoteContent): Autosave {
    return createAutosave({
      path: read.path,
      fingerprint: read.fingerprint,
      scheduler: this.scheduler,
      save: this.options.backend.saveNote,
      onSaved: (result) => {
        const from = note.path;
        if (this.notes.get(from) === note) {
          this.notes.delete(from);
          this.notes.set(result.path, note);
        }
        note.path = result.path;
        note.title = result.title;
        for (const viewer of note.viewers.keys()) viewer.saved(result.path);
        this.options.events.saved(from, result);
      },
      onError: this.options.events.error,
    });
  }
}

/** Les notes montrées par les colonnes, chacune avec un seul texte et un seul enregistrement. */
export function createSharedNotes(options: SharedNotesOptions): SharedNotes {
  return new SharedNoteList(options);
}
