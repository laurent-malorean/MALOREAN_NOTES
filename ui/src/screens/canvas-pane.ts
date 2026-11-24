// Canvas d'une colonne (fiche 0052) : quand le fichier montré est un `.canvas`, le tableau blanc prend la
// place de l'éditeur de texte, sur toute la surface de la colonne. Rust lit et écrit le fichier ; l'éditeur
// garde le texte du fichier, caché, pour l'historique et le suivi des changements venus d'ailleurs.
import type { CanvasFileItem, CanvasItem, ExportFile, ExportFormatItem } from "../bridge";
import { canvasTitle } from "../state/canvas-image";
import {
  type CanvasSettings,
  type CanvasView,
  DEFAULT_SETTINGS,
  createCanvasView,
} from "./canvas-view";
import { canvasImage } from "./canvas-image";

/** Ce que le canvas d'une colonne demande à Rust et au reste de l'application. */
export interface CanvasDeps {
  readonly readCanvas: (path: string) => Promise<CanvasFileItem>;
  readonly saveCanvas: (path: string, base: string, canvas: CanvasItem) => Promise<CanvasFileItem>;
  readonly chooseExportFile: (
    title: string,
    format: ExportFormatItem,
    folder: string | null,
    near: string | null,
  ) => Promise<ExportFile | null>;
  readonly exportImage: (destination: string, png: Uint8Array) => Promise<unknown>;
  readonly openWebAddress: (address: string) => Promise<unknown>;
  /** Fait choisir une note de l'espace de travail. */
  readonly chooseNote: () => Promise<string | null>;
  /** Fait choisir un média, à ranger avec le canvas `canvas` ; rend son chemin depuis la racine. */
  readonly chooseMedia: (canvas: string) => Promise<string | null>;
  readonly askText: (question: string, initial: string, confirm: string) => Promise<string | null>;
  readonly copy: (text: string) => void;
  /** Fait choisir un groupe du canvas montré (« Aller à un groupe »). */
  readonly chooseGroup: (groups: { id: string; title: string }[]) => Promise<string | null>;
}

export interface CanvasPaneOptions {
  readonly deps: CanvasDeps;
  readonly openNote: (path: string, inNewTab: boolean) => void;
  readonly error: (error: unknown) => void;
  readonly notice: (message: string) => void;
  /** L'adresse chargeable d'une image écrite dans la note `note` (`null` : depuis la racine). */
  readonly resolveImage: (src: string, note: string | null) => string;
}

export interface CanvasPane {
  /** Montre le canvas si le fichier `path` en est un ; l'éditeur sinon. */
  sync(path: string | null): Promise<void>;
  /** Le canvas est affiché. */
  shown(): boolean;
  /** « Canvas : tout voir ». */
  fitAll(): void;
  /** « Canvas : aller à un groupe ». */
  goToGroup(): Promise<void>;
  /** « Canvas : exporter en image ». */
  exportImage(): Promise<void>;
  destroy(): void;
}

const SETTINGS_KEY = "canvas-settings";

const settingsMemory = {
  load(): CanvasSettings {
    try {
      return {
        ...DEFAULT_SETTINGS,
        ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as object),
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  store(settings: CanvasSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Le stockage est refusé : les réglages ne sont pas gardés.
    }
  },
};

export const isCanvasPath = (path: string | null): path is string =>
  path !== null && /\.canvas$/i.test(path);

class ColumnCanvas implements CanvasPane {
  private view: CanvasView | null = null;
  private path: string | null = null;

  constructor(
    private readonly column: HTMLElement,
    private readonly options: CanvasPaneOptions,
  ) {}

  shown(): boolean {
    return this.view !== null;
  }

  fitAll(): void {
    this.view?.fitAll();
  }

  async goToGroup(): Promise<void> {
    if (this.view === null) return;
    const groups = this.view.groups();
    if (groups.length === 0) return this.options.notice("Ce canvas n'a aucun groupe.");
    const chosen = await this.options.deps.chooseGroup(groups);
    if (chosen !== null) this.view.goToGroup(chosen);
  }

  async exportImage(): Promise<void> {
    const { deps, notice } = this.options;
    if (this.view === null || this.path === null) return;
    const png = await canvasImage(this.view.canvas(), this.view.element);
    if (png === null) return notice("Un canvas vide ne s'exporte pas.");
    const title = canvasTitle(this.path);
    const file = await deps.chooseExportFile(title, "png", null, this.path);
    if (file === null) return;
    await deps.exportImage(file.path, png);
    notice(`« ${title} » exporté dans ${file.path}`);
  }

  async sync(path: string | null): Promise<void> {
    if (!isCanvasPath(path)) return this.close();
    if (this.path !== path) this.open(path);
    const file = await this.options.deps.readCanvas(path);
    // La colonne a pu montrer un autre fichier pendant la lecture.
    if (this.path !== path) return;
    this.view?.setFile(file);
    this.view?.show();
  }

  destroy(): void {
    this.close();
  }

  private open(path: string): void {
    this.close();
    const { deps, openNote, error, notice, resolveImage } = this.options;
    this.path = path;
    this.view = createCanvasView({
      save: (canvas, base) => deps.saveCanvas(path, base, canvas),
      painter: { resolveImage: (src) => resolveImage(src, null), openNote },
      openExternal: (url) => void deps.openWebAddress(url).catch(error),
      chooseNote: deps.chooseNote,
      chooseMedia: () => deps.chooseMedia(path),
      askText: deps.askText,
      copy: deps.copy,
      notice,
      error,
      settings: settingsMemory,
    });
    this.column.append(this.view.element);
    this.column.classList.add("canvas-shown");
  }

  private close(): void {
    this.view?.destroy();
    this.view = null;
    this.path = null;
    this.column.classList.remove("canvas-shown");
  }
}

export function createCanvasPane(column: HTMLElement, options: CanvasPaneOptions): CanvasPane {
  return new ColumnCanvas(column, options);
}
