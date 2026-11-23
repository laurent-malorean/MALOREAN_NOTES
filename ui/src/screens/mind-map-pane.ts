// Carte mentale d'une colonne (fiche 0050) : quand la note montrée est une carte mentale, la carte
// prend la place de l'éditeur de texte, sur toute la surface de la colonne. Rust lit et écrit le
// fichier ; l'éditeur garde le texte de la note, caché, pour l'enregistrement et l'historique.
import type { ExportFile, ExportFormatItem, MindMapItem } from "../bridge";
import { mapTitle } from "../state/mind-map-image";
import { isMindMapContent } from "../state/mind-map";
import { createMindMapView, type MindMapView } from "./mind-map-view";

/** Ce que la carte d'une colonne demande à Rust, par le pont. */
export interface MindMapBackend {
  readonly readMindMap: (path: string) => Promise<MindMapItem>;
  readonly saveMindMap: (path: string, map: MindMapItem) => Promise<unknown>;
  readonly openLinkTarget: (path: string, target: string) => Promise<unknown>;
  readonly chooseExportFile: (
    title: string,
    format: ExportFormatItem,
    folder: string | null,
    near: string | null,
  ) => Promise<ExportFile | null>;
  readonly exportImage: (destination: string, png: Uint8Array) => Promise<unknown>;
}

export interface MindMapPaneOptions {
  readonly backend: MindMapBackend;
  readonly openLink: (title: string, inNewTab: boolean) => void;
  readonly error: (error: unknown) => void;
  /** Un message d'information. */
  readonly notice: (message: string) => void;
  /** L'adresse chargeable d'une image écrite dans la note `note`. */
  readonly resolveImage: (src: string, note: string | null) => string;
}

export interface MindMapPane {
  /** Montre la carte si la note `path`, de texte `content`, en est une ; l'éditeur sinon. */
  sync(path: string | null, content: string): Promise<void>;
  /** Choisit le nœud de ce chemin (`1.0.2`) de la carte affichée. */
  reveal(node: string): void;
  /** La carte est affichée. */
  shown(): boolean;
  destroy(): void;
}

const FOLDED_KEY = "mind-map-folded:";

/** Les branches pliées d'une carte, gardées sur ce Mac. */
function foldedMemory(path: string) {
  return {
    load(): string[] {
      try {
        return JSON.parse(localStorage.getItem(FOLDED_KEY + path) ?? "[]") as string[];
      } catch {
        return [];
      }
    },
    store(keys: readonly string[]): void {
      try {
        localStorage.setItem(FOLDED_KEY + path, JSON.stringify(keys));
      } catch {
        // Le stockage est refusé : les branches pliées ne sont pas gardées.
      }
    },
  };
}

class ColumnMindMap implements MindMapPane {
  private view: MindMapView | null = null;
  private path: string | null = null;
  private title = "";

  constructor(
    private readonly column: HTMLElement,
    private readonly options: MindMapPaneOptions,
  ) {}

  reveal(node: string): void {
    this.view?.reveal(node.split(".").map(Number));
  }

  shown(): boolean {
    return this.view !== null;
  }

  async sync(path: string | null, content: string): Promise<void> {
    if (path === null || !isMindMapContent(content)) return this.close();
    if (this.path !== path) this.open(path);
    this.title = mapTitle(content, path);
    const map = await this.options.backend.readMindMap(path);
    // La colonne a pu montrer une autre note pendant la lecture.
    if (this.path !== path) return;
    this.view?.setMap(map);
    this.view?.show();
  }

  destroy(): void {
    this.close();
  }

  private open(path: string): void {
    this.close();
    const { backend, openLink, error, notice, resolveImage } = this.options;
    this.path = path;
    this.view = createMindMapView({
      save: (map) => backend.saveMindMap(path, map).then(() => undefined),
      read: () => backend.readMindMap(path),
      notice,
      openWikiLink: openLink,
      openLink: (target) => void backend.openLinkTarget(path, target).catch(error),
      error,
      resolveImage: (src) => resolveImage(src, path),
      folded: foldedMemory(path),
      exportImage: (png) => this.saveImage(png),
    });
    this.column.append(this.view.element);
    this.column.classList.add("mind-map-shown");
  }

  /** Fait choisir le fichier dans la fenêtre d'enregistrement du Mac, qui s'ouvre dans le dossier de la carte, puis y écrit l'image. */
  private async saveImage(png: Uint8Array): Promise<void> {
    const { backend, notice } = this.options;
    if (this.path === null) return;
    const file = await backend.chooseExportFile(this.title, "png", null, this.path);
    if (file === null) return;
    await backend.exportImage(file.path, png);
    notice(`« ${this.title} » exportée dans ${file.path}`);
  }

  private close(): void {
    this.view?.destroy();
    this.view = null;
    this.path = null;
    this.column.classList.remove("mind-map-shown");
  }
}

export function createMindMapPane(column: HTMLElement, options: MindMapPaneOptions): MindMapPane {
  return new ColumnMindMap(column, options);
}
