// Événement d'une colonne (fiche 0104) : quand la note montrée est un événement d'un agenda 12, sa bande
// se pose au-dessus de l'éditeur, qui garde le texte de la note (spécification § 4.2).
import { isAgenda12EventContent } from "../state/agenda-12";
import type { Agenda12Deps } from "./agenda-12-pane";
import { createEventBand, type EventBand } from "./agenda-12-event-band";

export interface EventPaneOptions {
  readonly deps: Agenda12Deps;
  readonly error: (error: unknown) => void;
  /** Enregistre ce qui est tapé dans la note de la colonne. */
  readonly flush: () => Promise<void>;
  /** Relit le texte de la note de la colonne sur le disque. */
  readonly followText: () => Promise<void>;
}

export interface EventPane {
  /** Montre la bande si la note `path`, de texte `content`, est un événement ; la retire sinon. */
  sync(path: string | null, content: string): Promise<void>;
  /** La bande est affichée. */
  shown(): boolean;
  /** Relit la bande montrée : le titre du texte a pu changer. */
  refresh(): Promise<void>;
  /** Met le curseur sur le titre de la bande. */
  focusTitle(): void;
  destroy(): void;
}

class ColumnEvent implements EventPane {
  private band: EventBand | null = null;
  private path: string | null = null;

  constructor(
    private readonly column: HTMLElement,
    private readonly options: EventPaneOptions,
  ) {}

  shown(): boolean {
    return this.band !== null;
  }

  focusTitle(): void {
    this.band?.focusTitle();
  }

  async refresh(): Promise<void> {
    await this.band?.reload();
  }

  async sync(path: string | null, content: string): Promise<void> {
    if (path === null || !isAgenda12EventContent(content)) return this.close();
    if (this.path !== path) this.open(path);
    await this.band?.reload();
  }

  destroy(): void {
    this.close();
  }

  private open(path: string): void {
    this.close();
    const { deps, error, flush, followText } = this.options;
    this.path = path;
    this.band = createEventBand({
      ...{ backend: deps.backend, path, error, flush, followText },
      currentYear: deps.currentYear,
      errorText: deps.errorText,
      ...{ askClosing: deps.askClosing, trashEvent: deps.trashEvent },
      open: (target) => deps.open(target, false),
    });
    // Au-dessus du texte : devant l'éditeur, derrière la barre d'étiquettes.
    this.column.insertBefore(this.band.element, this.column.querySelector(":scope > .cm-editor"));
  }

  private close(): void {
    this.band?.destroy();
    this.band = null;
    this.path = null;
  }
}

export function createEventPane(column: HTMLElement, options: EventPaneOptions): EventPane {
  return new ColumnEvent(column, options);
}
