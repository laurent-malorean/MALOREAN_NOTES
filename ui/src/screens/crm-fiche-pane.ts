// Fiche d'entreprise ou de personne d'une colonne (fiche 0063, spécification § 9) : quand la note
// montrée est une de ces fiches rangée dans le dossier de son CRM, son écran prend la place de
// l'éditeur de texte. Rust lit et écrit les fichiers ; l'éditeur garde le texte de la note, caché.
import { type FicheTarget, ficheTarget } from "../state/crm-fiche";
import type { CrmDeps } from "./crm-pane";
import { type FicheView, createFicheView } from "./crm-fiche-view";
import { NO_HOOKS } from "./crm-hooks";

export interface FichePaneOptions {
  readonly deps: CrmDeps;
  readonly error: (error: unknown) => void;
  /** Ouvre une autre fiche, dans la colonne. */
  readonly openNote: (path: string) => void;
}

export interface FichePane {
  /** Montre la fiche si la note `path`, de texte `content`, en est une ; l'éditeur sinon. */
  sync(path: string | null, content: string): Promise<void>;
  /** Des fichiers ont changé hors de l'application : relit la fiche montrée si l'un est dans son CRM. */
  refresh(changed: readonly string[]): Promise<void>;
  shown(): boolean;
  destroy(): void;
}

/** La classe de la colonne qui cache l'éditeur de texte. */
export const SHOWN_CLASS = "fiche-shown";

class ColumnFiche implements FichePane {
  private view: FicheView | null = null;
  private target: FicheTarget | null = null;
  private path: string | null = null;

  constructor(
    private readonly column: HTMLElement,
    private readonly options: FichePaneOptions,
  ) {}

  shown(): boolean {
    return this.view !== null;
  }

  async sync(path: string | null, content: string): Promise<void> {
    const target = path === null ? null : ficheTarget(path, content);
    if (path === null || target === null) return this.close();
    if (this.path !== path) this.open(path, target);
    await this.view?.reload();
  }

  async refresh(changed: readonly string[]): Promise<void> {
    if (this.target === null) return;
    const { crm } = this.target;
    const folder = `${crm.replace(/\.md$/i, "")}/`;
    if (changed.some((path) => path === crm || path.startsWith(folder))) await this.view?.reload();
  }

  destroy(): void {
    this.close();
  }

  private open(path: string, target: FicheTarget): void {
    this.close();
    const { deps, error, openNote } = this.options;
    this.path = path;
    this.target = target;
    this.view = createFicheView({
      ...{ backend: deps.backend, confirm: deps.confirm, error, openNote, target },
      hooks: deps.hooks ?? NO_HOOKS,
    });
    this.column.append(this.view.element);
    this.column.classList.add(SHOWN_CLASS);
  }

  private close(): void {
    this.view?.destroy();
    this.view = null;
    this.target = null;
    this.path = null;
    this.column.classList.remove(SHOWN_CLASS);
  }
}

export function createFichePane(column: HTMLElement, options: FichePaneOptions): FichePane {
  return new ColumnFiche(column, options);
}
