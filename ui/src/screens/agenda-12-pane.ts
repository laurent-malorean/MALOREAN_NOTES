// Agenda 12 d'une colonne (fiche 0104) : quand la note montrée est un agenda 12, sa grille prend la place
// de l'éditeur de texte, sur toute la surface de la colonne. Rust lit et écrit les fichiers ; l'éditeur
// garde le texte de la note, caché, pour l'historique et le suivi des changements venus d'ailleurs.
import type { Agenda12ClosingItem } from "../bridge";
import { isAgenda12Content, touchesAgenda12 } from "../state/agenda-12";
import type { Agenda12EventBackend, TrashedEvent } from "./agenda-12-event-band";
import { type Agenda12Backend, type Agenda12View, createAgenda12View } from "./agenda-12-view";

/** Ce que l'agenda 12 d'une colonne demande à Rust et à l'application. */
export interface Agenda12Deps {
  readonly backend: Agenda12Backend & Agenda12EventBackend;
  /** Ouvre la note `path` dans la colonne active ; `focusTitle` : le curseur va sur le titre de l'événement. */
  readonly open: (path: string, focusTitle: boolean) => Promise<void>;
  /** Demande comment clore l'événement titré `title` ; `null` si on annule. */
  readonly askClosing: (title: string) => Promise<Agenda12ClosingItem | null>;
  /** Place l'événement dans la corbeille, après confirmation, et ouvre son agenda 12. */
  readonly trashEvent: (event: TrashedEvent) => Promise<void>;
  /** Le message d'une erreur de Rust, prêt à montrer. */
  readonly errorText: (error: unknown) => string;
  /** L'année en cours, d'après l'horloge du Mac. */
  readonly currentYear: () => number;
}

export interface Agenda12PaneOptions {
  readonly deps: Agenda12Deps;
  readonly error: (error: unknown) => void;
}

export interface Agenda12Pane {
  /** Montre la grille si la note `path`, de texte `content`, est un agenda 12 ; l'éditeur sinon. */
  sync(path: string | null, content: string): Promise<void>;
  /** Des fichiers ont changé hors de l'application : relit la grille montrée si l'un est son agenda 12 ou son événement. */
  refresh(changed: readonly string[]): Promise<void>;
  /** La grille est affichée. */
  shown(): boolean;
  destroy(): void;
}

/** La classe de la colonne qui cache l'éditeur de texte. */
export const SHOWN_CLASS = "agenda-shown";

class ColumnAgenda implements Agenda12Pane {
  private view: Agenda12View | null = null;
  private path: string | null = null;

  constructor(
    private readonly column: HTMLElement,
    private readonly options: Agenda12PaneOptions,
  ) {}

  shown(): boolean {
    return this.view !== null;
  }

  async sync(path: string | null, content: string): Promise<void> {
    if (path === null || !isAgenda12Content(content)) return this.close();
    if (this.path !== path) this.open(path);
    await this.view?.reload();
  }

  async refresh(changed: readonly string[]): Promise<void> {
    if (this.path !== null && touchesAgenda12(this.path, changed)) await this.view?.reload();
  }

  destroy(): void {
    this.close();
  }

  private open(path: string): void {
    this.close();
    const { deps, error } = this.options;
    this.path = path;
    this.view = createAgenda12View({
      ...{ backend: deps.backend, path, error },
      open: (event, created) => void deps.open(event, created).catch(error),
    });
    this.column.append(this.view.element);
    this.column.classList.add(SHOWN_CLASS);
  }

  private close(): void {
    this.view?.destroy();
    this.view = null;
    this.path = null;
    this.column.classList.remove(SHOWN_CLASS);
  }
}

export function createAgenda12Pane(
  column: HTMLElement,
  options: Agenda12PaneOptions,
): Agenda12Pane {
  return new ColumnAgenda(column, options);
}
