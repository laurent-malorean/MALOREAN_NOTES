// CRM d'une colonne (fiche 0060) : quand la note montrée est un CRM, ses onglets prennent la place
// de l'éditeur de texte, sur toute la surface de la colonne. Rust lit et écrit les fichiers ; l'éditeur
// garde le texte de la note, caché, pour l'historique et le suivi des changements venus d'ailleurs.
import { isCrmContent, type CrmTab } from "../state/crm";
import { crmFichePath } from "../state/crm-fiche";
import { storedUnfolded } from "./crm-lists";
import { type CrmBackend, type CrmView, createCrmView } from "./crm-view";

/** Ce que le CRM d'une colonne demande à Rust et à l'application. */
export interface CrmDeps {
  readonly backend: CrmBackend;
  /** Pose une question avant un geste qui en change d'autres ; rend vrai si l'utilisateur accepte. */
  readonly confirm: (question: string, confirm: string) => Promise<boolean>;
  /** Fait choisir une note par la recherche de notes (fenêtre d'une action) ; son titre, `null` si on annule. */
  readonly chooseNote: () => Promise<string | null>;
}

export interface CrmPaneOptions {
  readonly deps: CrmDeps;
  readonly error: (error: unknown) => void;
  /** Ouvre la note de ce titre dans la colonne active. */
  readonly openNote: (title: string) => void;
  /** Dit quelque chose à l'utilisateur (« E-mails copiés. »). */
  readonly notice: (message: string) => void;
  /** Ouvre la note d'une entreprise ou d'une personne, par son chemin, dans la colonne (fiche 0063). */
  readonly openFiche: (path: string) => void;
}

export interface CrmPane {
  /** Montre le CRM si la note `path`, de texte `content`, en est un ; l'éditeur sinon. */
  sync(path: string | null, content: string): Promise<void>;
  /** Des fichiers ont changé hors de l'application : relit le CRM montré s'il en est le conteneur. */
  refresh(changed: readonly string[]): Promise<void>;
  /** Le CRM est affiché. */
  shown(): boolean;
  destroy(): void;
}

const TAB_KEY = "crm-tab:";

/** L'onglet d'un CRM, gardé sur ce Mac (jamais dans le fichier). */
function tabMemory(path: string) {
  return {
    load(): string | null {
      try {
        return localStorage.getItem(TAB_KEY + path);
      } catch {
        return null;
      }
    },
    store(tab: CrmTab): void {
      try {
        localStorage.setItem(TAB_KEY + path, tab);
      } catch {
        // Le stockage est refusé : l'onglet n'est pas gardé.
      }
    },
  };
}

/** Le dossier des fiches d'un CRM : celui qui porte son nom de fichier (`Clients/prospects.md` : `Clients/prospects/`). */
export const crmFolder = (path: string): string => `${path.replace(/\.md$/i, "")}/`;

class ColumnCrm implements CrmPane {
  private view: CrmView | null = null;
  private path: string | null = null;

  constructor(
    private readonly column: HTMLElement,
    private readonly options: CrmPaneOptions,
  ) {}

  shown(): boolean {
    return this.view !== null;
  }

  async sync(path: string | null, content: string): Promise<void> {
    if (path === null || !isCrmContent(content)) return this.close();
    if (this.path !== path) this.open(path);
    await this.view?.reload();
  }

  async refresh(changed: readonly string[]): Promise<void> {
    if (this.path === null) return;
    const folder = crmFolder(this.path);
    if (changed.some((path) => path.startsWith(folder))) await this.view?.reload();
  }

  destroy(): void {
    this.close();
  }

  private open(path: string): void {
    this.close();
    const { deps, error, openNote, notice, openFiche } = this.options;
    this.path = path;
    this.view = createCrmView({
      ...{ ...deps, path, error, openNote, notice, tab: tabMemory(path) },
      ...{ unfolded: storedUnfolded(path), openFiche },
      openPerson: (reference) => openFiche(crmFichePath(path, "person", reference)),
    });
    this.column.append(this.view.element);
    this.column.classList.add("crm-shown");
  }

  private close(): void {
    this.view?.destroy();
    this.view = null;
    this.path = null;
    this.column.classList.remove("crm-shown");
  }
}

export function createCrmPane(column: HTMLElement, options: CrmPaneOptions): CrmPane {
  return new ColumnCrm(column, options);
}
