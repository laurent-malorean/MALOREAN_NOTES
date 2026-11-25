// Une colonne à l'écran : son éditeur, la note qu'il montre, partagée avec les autres colonnes.
import type { AttachmentOrigin, EntryItem, NoteListItem } from "../bridge";
import type { AttachedFile } from "../bridge/generated/AttachedFile";
import type { LinkingNoteItem } from "../bridge/generated/LinkingNoteItem";
import { createEditor, type Editor } from "../editor/editor";
import type { OpenNoteLink } from "../editor/links/note-links";
import { lineStart } from "../state/research-notebook";
import { renderBacklinks } from "./backlinks-view";
import { type CanvasDeps, type CanvasPane, createCanvasPane } from "./canvas-pane";
import { type CrmDeps, type CrmPane, createCrmPane } from "./crm-pane";
import { createMindMapPane, type MindMapBackend, type MindMapPane } from "./mind-map-pane";
import type { ColumnParts } from "./columns-view";
import { renderRelatedNotes } from "./related-view";
import type { SharedNotes, Viewer } from "./shared-notes";

/** Ce qu'une colonne demande à Rust, par le pont. */
export interface PaneBackend extends Partial<MindMapBackend> {
  readonly listBacklinks: (path: string) => Promise<LinkingNoteItem[]>;
  readonly attachFile: (
    path: string,
    file: File,
    origin: AttachmentOrigin,
  ) => Promise<AttachedFile>;
  readonly openLinkTarget: (path: string, target: string) => Promise<unknown>;
}

/** Ce qu'une colonne annonce à l'application. */
export interface PaneEvents {
  /** Ouvrir une note des liens entrants. */
  readonly openNote: (path: string) => void;
  /** Ouvrir la note visée par un lien `[[titre]]`, en la suivant ou dans un nouvel onglet. */
  readonly openLink: OpenNoteLink;
  readonly error: (error: unknown) => void;
  /** Montre un message ; sans cela, les messages d'information d'une carte mentale ne sont pas dits. */
  readonly show?: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
}

/** Ce qu'une colonne fait d'un cahier de recherche qu'elle montre (fiche 0041). */
export interface NotebookActions {
  /** Ajouter l'entrée saisie au cahier ; dit si c'est fait. */
  add(path: string, text: string): Promise<boolean>;
  /** Ses entrées, pour montrer celle que vise un lien `#ancre`. */
  entries(path: string): Promise<EntryItem[]>;
}

/** Les notes proches, sous le texte : affichées ou non, et celles d'une note (fiche 0046). */
export interface RelatedNotes {
  /** La liste est demandée : sans cela, rien n'est lu ni montré. */
  enabled(): boolean;
  notes(path: string): Promise<NoteListItem[]>;
}

export interface PaneOptions {
  readonly backend: PaneBackend;
  readonly events: PaneEvents;
  /** Les notes montrées par toutes les colonnes : lecture, frappe partagée, enregistrement. */
  readonly shared: SharedNotes;
  /** L'adresse chargeable d'une image écrite dans la note `note`. */
  readonly resolveImage: (src: string, note: string | null) => string;
  /** Sans elles, un cahier de recherche reste en lecture seule, sans zone de saisie ni lien vers une entrée. */
  readonly notebook?: NotebookActions;
  /** Sans elles, aucune liste de notes proches n'est montrée. */
  readonly related?: RelatedNotes;
  /** Sans lui, un canvas reste du texte (fiche 0052). */
  readonly canvas?: CanvasDeps;
  /** Sans lui, un CRM reste du texte (fiche 0060). */
  readonly crm?: CrmDeps;
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
  /** La note a quitté l'espace de travail : ce qu'on tape n'est plus enregistré. */
  forget(): void;
  /** Une carte mentale montrée : choisit son nœud de ce chemin (`1.0.2`), ses ancêtres dépliés, la vue centrée sur lui. */
  revealNode(node: string): void;
  /** Le canvas montré, s'il y en a un (fiche 0052). */
  canvasPane(): CanvasPane | null;
  /** Des fichiers ont changé hors de l'application : un CRM montré dont l'un est une fiche est relu (fiche 0060). */
  followCrm(changed: readonly string[]): Promise<void>;
  /** Montre les liens entrants de la note ; une réponse arrivée pour une autre note est ignorée. */
  showBacklinks(): Promise<void>;
  /** Montre les notes proches de la note, ou cache la liste si elle n'est pas demandée. */
  showRelated(): Promise<void>;
  /** La note a changé sur le disque : voir la fiche de décision 0014. */
  followDisk(): Promise<void>;
  /** Retire la colonne de l'écran, ce qui est tapé étant enregistré. */
  destroy(): void;
}

/** Ce qui commence la cible d'un lien vers une entrée du cahier montré : `#2026-11-20-09h42`. */
const ANCHOR_MARK = "#";

/** Une colonne : son éditeur et la note qu'il montre ; le texte et l'enregistrement sont partagés. */
class NotePane implements Pane, Viewer {
  readonly editor: Editor;
  private shown: string | null = null;
  private readonly map: MindMapPane | null;
  private readonly canvas: CanvasPane | null;
  private readonly crm: CrmPane | null;

  constructor(
    private readonly parts: ColumnParts,
    private readonly options: PaneOptions,
  ) {
    const { backend, events, shared, notebook } = options;
    const { readMindMap, saveMindMap, chooseExportFile, exportImage } = backend;
    this.map =
      readMindMap && saveMindMap && chooseExportFile && exportImage
        ? createMindMapPane(parts.element, {
            backend: {
              readMindMap,
              saveMindMap,
              openLinkTarget: backend.openLinkTarget,
              chooseExportFile,
              exportImage,
            },
            openLink: events.openLink,
            error: events.error,
            notice: (message) => events.show?.(message, "info"),
            resolveImage: options.resolveImage,
          })
        : null;
    this.canvas = options.canvas
      ? createCanvasPane(parts.element, {
          deps: options.canvas,
          openNote: (path) => events.openNote(path),
          error: events.error,
          notice: (message) => events.show?.(message, "info"),
          resolveImage: options.resolveImage,
        })
      : null;
    this.crm = options.crm
      ? createCrmPane(parts.element, { deps: options.crm, error: events.error })
      : null;
    this.editor = createEditor(
      parts.element,
      (content, changes) => shared.typed(this, changes, content),
      {
        // Une image relative est cherchée à côté de la note, dans son dossier.
        resolveImage: (src) => options.resolveImage(src, this.shown),
        attachmentActions: {
          attach: (file, origin) => this.attach(file, origin),
          open: (target) => {
            if (this.shown === null) return;
            const opening =
              notebook && target.startsWith(ANCHOR_MARK)
                ? this.showEntry(notebook, this.shown, target.slice(ANCHOR_MARK.length))
                : backend.openLinkTarget(this.shown, target);
            void opening.catch(events.error);
          },
        },
        openLink: events.openLink,
        // La zone de saisie n'apparaît que sur un cahier montré : il y a toujours une note.
        addEntry: notebook && ((text) => notebook.add(this.shown as string, text)),
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
    void this.showRelated().catch(this.options.events.error);
    if (path === null) {
      this.editor.show("");
      return this.showMap();
    }
    await this.options.shared.join(path, this);
    await this.showMap();
  }

  /** La carte mentale ou le canvas prend la place de l'éditeur si le fichier en est un. */
  private async showMap(): Promise<void> {
    try {
      await this.canvas?.sync(this.shown);
      await this.map?.sync(this.shown, this.editor.content());
      await this.crm?.sync(this.shown, this.editor.content());
    } catch (error) {
      this.options.events.error(error);
    }
  }

  async flush(): Promise<void> {
    await this.options.shared.flush(this);
  }

  forget(): void {
    this.options.shared.forget(this);
  }

  revealNode(node: string): void {
    this.map?.reveal(node);
  }

  canvasPane(): CanvasPane | null {
    return this.canvas;
  }

  async followCrm(changed: readonly string[]): Promise<void> {
    try {
      await this.crm?.refresh(changed);
    } catch (error) {
      this.options.events.error(error);
    }
  }

  async showBacklinks(): Promise<void> {
    const path = this.shown;
    const notes = path === null ? [] : await this.options.backend.listBacklinks(path);
    if (this.shown === path)
      renderBacklinks(this.parts.backlinks, notes, this.options.events.openNote);
  }

  async showRelated(): Promise<void> {
    const { related, events } = this.options;
    const path = this.shown;
    const wanted = related !== undefined && related.enabled() && path !== null;
    if (!wanted) return renderRelatedNotes(this.parts.related, null, events.openNote);
    const notes = await related.notes(path);
    if (this.shown === path && related.enabled()) {
      renderRelatedNotes(this.parts.related, notes, events.openNote);
    }
  }

  async followDisk(): Promise<void> {
    await this.options.shared.followDisk(this);
    await this.showMap();
  }

  /** La note vient d'être enregistrée sous ce chemin ; son titre, donc ses liens entrants, ont pu changer. */
  saved(path: string): void {
    this.shown = path;
    void this.showBacklinks().catch(this.options.events.error);
  }

  destroy(): void {
    void this.options.shared.leave(this).catch(this.options.events.error);
    this.map?.destroy();
    this.canvas?.destroy();
    this.crm?.destroy();
    this.editor.destroy();
  }

  /** Montre en haut de l'écran l'entrée du cahier `path` que désigne l'ancre `anchor`. */
  private async showEntry(notebook: NotebookActions, path: string, anchor: string): Promise<void> {
    const entry = (await notebook.entries(path)).find((e) => e.anchor === anchor);
    if (entry === undefined) throw { message: `Aucune entrée « ${anchor} » dans ce cahier.` };
    if (this.shown !== path) return;
    const at = lineStart(this.editor.content(), entry.line);
    this.editor.restore({ anchor: at, head: at, top: at, offset: 0 });
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
